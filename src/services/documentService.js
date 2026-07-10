/**
 * Document Processing Service
 * Handles PDF and DOCX parsing and chunking
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
 * @param {File} file - The PDF file uploaded by the user
 * @returns {Array<{pageNumber: number, content: string}>} Extracted text per page
 */
export async function parsePDF(file) {
  try {
    // Import the main pdfjs library (Vite bundles this fine — it's the worker that's tricky)
    const pdfjs = await import('pdfjs-dist');

    // Point to the worker file we copied to public/ — served as a static asset
    // This avoids all Vite bundler/worker resolution issues
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

    // Read the file as binary data (ArrayBuffer)
    const arrayBuffer = await file.arrayBuffer();

    // Parse the PDF document — returns an object with page count and page accessors
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    
    // Extract text from each page one by one
    const pages = [];
    for (let i = 0; i < pdf.numPages; i++) {
      const page = await pdf.getPage(i + 1);
      const textContent = await page.getTextContent();
      // textContent.items is an array of text segments — join them into one string
      const text = textContent.items.map(item => item.str).join(' ');
      pages.push({
        pageNumber: i + 1,
        content: text
      });
    }

    return pages;
  } catch (error) {
    console.error('[documentService] PDF parsing error:', error);
    throw new Error(`Failed to parse PDF: ${error.message}`, { cause: error });
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

    if (!text) {
      return [{
        pageNumber: 1,
        content: 'DOCX content could not be extracted. The file may be empty or use unsupported formatting.'
      }];
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
 * Chunk text into smaller pieces for embedding
 * Uses semantic chunking with overlap
 */
export function chunkText(text, chunkSize = 1000, overlap = 200) {
  const chunks = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  let currentChunk = '';
  let chunkIndex = 0;

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > chunkSize) {
      if (currentChunk.length > 0) {
        chunks.push({
          id: chunkIndex++,
          content: currentChunk.trim(),
          size: currentChunk.length
        });

        // Add overlap from previous chunk
        const overlapContent = currentChunk.substring(currentChunk.length - overlap);
        currentChunk = overlapContent + ' ' + sentence;
      } else {
        currentChunk = sentence;
      }
    } else {
      currentChunk += ' ' + sentence;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push({
      id: chunkIndex++,
      content: currentChunk.trim(),
      size: currentChunk.length
    });
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
