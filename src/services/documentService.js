/**
 * Document Processing Service
 * Handles PDF and DOCX parsing and chunking
 * 
 * ### How this fits in the RAG pipeline:
 * This is the FIRST step when a user uploads a document. Before text can be embedded
 * and searched, it must be:
 * 1. PARSED — extracted from its binary format (PDF is a complex rendering format,
 *    DOCX is a ZIP of XML files). We need raw text.
 * 2. CHUNKED — split into smaller pieces (~1000 chars). LLMs have token limits, and
 *    embeddings work best on focused, coherent passages — not entire documents.
 * 
 * After this service runs, ragService.js takes over to embed and store the chunks.
 */

/**
 * Parse PDF file and extract text.
 * Uses pdfjs-dist v6 with the worker served as a static file from /public.
 * 
 * WHY this approach: pdfjs-dist requires a Web Worker for PDF parsing.
 * Vite's bundler struggles with dynamic worker imports from node_modules.
 * The reliable fix is to copy the worker to public/ and reference it by URL.
 * If you upgrade pdfjs-dist, re-copy the worker:
 *   cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
 * 
 * Precious's addition: graceful fallback to legacy build if main entry fails,
 * and safer text item extraction with type guard + whitespace normalization.
 * 
 * @param {File} file - The PDF file uploaded by the user
 * @returns {Array<{pageNumber: number, content: string}>} Extracted text per page
 */
export async function parsePDF(file) {
  try {
    // Import the main pdfjs library (Vite bundles this fine — it's the worker that's tricky)
    // Fall back to the legacy build if the main entry is unavailable (Precious's addition)
    let pdfjs;
    try {
      pdfjs = await import('pdfjs-dist');
    } catch {
      try {
        pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      } catch {
        throw new Error('PDF parsing library not available. Please install pdfjs-dist: npm install pdfjs-dist');
      }
    }

    // Point to the worker file we copied to public/ — served as a static asset.
    // This avoids all Vite bundler/worker resolution issues.
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    }

    // Read the file as binary data (ArrayBuffer)
    const arrayBuffer = await file.arrayBuffer();

    // Parse the PDF document — returns an object with page count and page accessors
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

    // Extract text from each page one by one
    const pages = [];
    for (let i = 0; i < pdf.numPages; i++) {
      const page = await pdf.getPage(i + 1);
      const textContent = await page.getTextContent();
      // textContent.items is an array of text segments — guard for non-string items
      // (Precious's addition) and normalize whitespace so chunks are clean
      const text = textContent.items
        .map(item => (typeof item.str === 'string' ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      pages.push({
        pageNumber: i + 1,
        content: text
      });
    }

    // Filter out empty pages (e.g. scanned image pages with no OCR text)
    // WHY: image-only pages produce empty strings that become useless zero-content chunks
    return pages.filter(p => p.content.trim().length > 0);
  } catch (error) {
    console.error('[documentService] PDF parsing error:', error);
    throw new Error(`Failed to parse PDF: ${error.message || 'Unknown PDF parsing error'}`, { cause: error });
  }
}

/**
 * Parse DOCX file and extract text.
 * Uses mammoth.js which properly reads the ZIP/XML structure of .docx files.
 * The old approach (file.text()) returned garbled binary — mammoth handles it correctly.
 * 
 * @param {File} file - The .docx file uploaded by the user
 * @returns {Array<{pageNumber: number, content: string}>} Extracted text as pages
 */
export async function parseDOCX(file) {
  try {
    // mammoth needs an ArrayBuffer (raw binary data), not a text string
    const arrayBuffer = await file.arrayBuffer();

    // Dynamically import mammoth so it doesn't block initial page load
    const mammoth = await import('mammoth');

    // extractRawText gives us plain text without HTML formatting
    // (we only need the text content for chunking and embedding)
    const result = await mammoth.extractRawText({ arrayBuffer });

    // result.value contains the extracted text
    // result.messages contains any warnings (we log them but don't fail)
    if (result.messages && result.messages.length > 0) {
      console.warn('[documentService] DOCX parsing warnings:', result.messages);
    }

    const text = (result.value || '').trim();

    // Return empty array when no text — let processDocument handle the "no content" case
    // WHY: embedding an error message as real content pollutes the vector store
    if (!text) {
      return [];
    }

    return [{
      pageNumber: 1,
      content: text
    }];
  } catch (error) {
    console.error('[documentService] DOCX parsing error:', error);
    throw new Error(
      `Failed to parse DOCX file: ${error.message}. Please ensure it is a valid Word document.`,
      { cause: error }
    );
  }
}

/**
 * Parse TXT file
 */
export async function parseTXT(file) {
  try {
    const text = await file.text();
    return [{
      pageNumber: 1,
      content: text
    }];
  } catch (error) {
    console.error('TXT parsing error:', error);
    throw new Error('Failed to parse text file.');
  }
}

/**
 * Chunk text into smaller pieces for embedding.
 * 
 * ### Why chunking matters:
 * Embeddings work best on focused, coherent text passages (~500-1500 chars).
 * A 20-page document embedded as one vector would produce a vague, diluted embedding.
 * Smaller chunks = more precise embeddings = better search results.
 * 
 * ### Strategy (in priority order):
 * 1. Split Q&A pairs (lines starting with **Q:) into individual chunks.
 *    WHY: Q&A pairs are self-contained — each is a perfect search target.
 * 2. Split on markdown headings (## or ###) to keep sections self-contained.
 *    WHY: Headings indicate topic boundaries. Splitting here means each chunk
 *    is about ONE topic, producing focused embeddings.
 * 3. Fall back to sentence-based chunking with overlap for plain text.
 *    WHY: When text has no structure, we split by sentence boundaries (not mid-word)
 *    and add overlap (200 chars) so context isn't lost at split points.
 * 
 * ### What is overlap?
 * If chunk 1 ends with "...the event starts at 9am" and chunk 2 starts with
 * "Volunteers should arrive by 8am...", the overlap includes the end of chunk 1
 * at the start of chunk 2. This ensures the search can find info that spans
 * a split boundary.
 */
export function chunkText(text, chunkSize = 1000, overlap = 200) {
  if (!text || text.trim().length === 0) return [];

  // Guard: overlap must be smaller than chunkSize to avoid infinite loops in sentenceChunk
  if (overlap >= chunkSize) {
    overlap = Math.floor(chunkSize / 5);
  }

  // Strategy 1: Detect if document has Q&A pairs — extract each as its own chunk
  const qaPairs = extractQAPairs(text);
  
  // If Q&A pairs were found, remove them from the main text to avoid duplication
  let mainText = text;
  if (qaPairs.length > 0) {
    mainText = text.replace(/\*\*Q:\s*.+?\*\*\s*A:\s*[\s\S]*?(?=\*\*Q:|$)/g, '').trim();
  }
  
  // Strategy 2: Detect if document has markdown headings — split by section
  const hasHeadings = /^#{1,3}\s+/m.test(mainText);
  
  let chunks = [];
  let chunkIndex = 0;

  if (hasHeadings) {
    // Split by headings, then chunk each section individually
    const sections = splitByHeadings(mainText);
    
    for (const section of sections) {
      if (section.content.trim().length < 20) continue; // Skip empty sections
      
      if (section.content.length <= chunkSize * 1.5) {
        // Section fits in one chunk — keep it whole
        chunks.push({
          id: chunkIndex++,
          content: (section.heading ? section.heading + '\n\n' : '') + section.content.trim(),
          size: section.content.length
        });
      } else {
        // Section is too long — use sentence-based sub-chunking
        const subChunks = sentenceChunk(
          (section.heading ? section.heading + '\n\n' : '') + section.content.trim(),
          chunkSize,
          overlap
        );
        for (const sub of subChunks) {
          chunks.push({ id: chunkIndex++, content: sub, size: sub.length });
        }
      }
    }
  } else {
    // No headings — use sentence-based chunking
    const plainChunks = sentenceChunk(mainText, chunkSize, overlap);
    for (const content of plainChunks) {
      chunks.push({ id: chunkIndex++, content, size: content.length });
    }
  }

  // Add Q&A pairs as separate focused chunks (on top of section chunks)
  for (const qa of qaPairs) {
    chunks.push({
      id: chunkIndex++,
      content: qa,
      size: qa.length
    });
  }

  return chunks;
}

/**
 * Extract Q&A pairs from text (pattern: **Q: ... ** A: ...)
 * Each pair becomes its own chunk for precise embedding matching.
 */
function extractQAPairs(text) {
  const pairs = [];
  // Match **Q: question** A: answer (until next **Q: or end of text)
  const qaRegex = /\*\*Q:\s*(.+?)\*\*\s*A:\s*([\s\S]*?)(?=\*\*Q:|$)/g;
  let match;
  while ((match = qaRegex.exec(text)) !== null) {
    const question = match[1].trim();
    const answer = match[2].trim();
    if (question && answer) {
      pairs.push(`Q: ${question}\nA: ${answer}`);
    }
  }
  return pairs;
}

/**
 * Split text by markdown headings (## or ###).
 * Returns array of { heading, content } objects.
 */
function splitByHeadings(text) {
  const sections = [];
  const lines = text.split('\n');
  let currentHeading = '';
  let currentContent = [];

  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) {
      // Save previous section
      if (currentContent.length > 0 || currentHeading) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join('\n')
        });
      }
      currentHeading = line.trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Don't forget the last section
  if (currentContent.length > 0 || currentHeading) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join('\n')
    });
  }

  return sections;
}

/**
 * Sentence-based chunking with overlap (original algorithm).
 * Used as fallback for plain text or oversized sections.
 */
function sentenceChunk(text, chunkSize = 1000, overlap = 200) {
  const chunks = [];
  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
  
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > chunkSize) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        const overlapContent = currentChunk.substring(currentChunk.length - overlap);
        currentChunk = overlapContent + ' ' + sentence;
      } else {
        currentChunk = sentence;
      }
    } else {
      currentChunk += ' ' + sentence;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Process uploaded document: parse -> chunk -> prepare for embedding
 */
export async function processDocument(file) {
  try {
    let pages = [];
    const fileName = file.name;
    const fileType = file.type || fileName.split('.').pop().toLowerCase();

    // Parse based on file type
    if (fileType === 'pdf' || fileName.endsWith('.pdf')) {
      pages = await parsePDF(file);
    } else if (fileType === 'docx' || fileName.endsWith('.docx')) {
      pages = await parseDOCX(file);
    } else if (fileType === 'txt' || fileName.endsWith('.txt')) {
      pages = await parseTXT(file);
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }

    // Fail early if parsing yielded no usable text (empty PDF, image-only scans, empty DOCX)
    // WHY: silently producing zero chunks would leave the caller with a "successful" upload
    // that has nothing searchable — better to surface the problem now
    const hasContent = pages.length > 0 && pages.some(p => p.content.trim().length > 0);
    if (!hasContent) {
      throw new Error('No text content could be extracted from this file');
    }

    // Chunk all pages
    const chunks = [];
    for (const page of pages) {
      const pageChunks = chunkText(page.content);
      chunks.push(...pageChunks.map(chunk => ({
        ...chunk,
        pageNumber: page.pageNumber,
        content: chunk.content
      })));
    }

    return {
      fileName,
      fileType,
      totalPages: pages.length,
      chunks,
      totalChunks: chunks.length
    };
  } catch (error) {
    console.error('Document processing error:', error);
    throw error;
  }
}

/**
 * Validate file before processing
 */
export function validateDocumentFile(file) {
  const MAX_SIZE = 50 * 1024 * 1024; // 50MB
  const ALLOWED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
  const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'];

  if (file.size > MAX_SIZE) {
    throw new Error(`File too large. Maximum size is ${MAX_SIZE / 1024 / 1024}MB`);
  }

  const extension = '.' + file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new Error(`Unsupported file type. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }

  return true;
}
