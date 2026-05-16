/**
 * Document Processing Service
 * Handles PDF and DOCX parsing and chunking
 */

/**
 * Parse PDF file and extract text
 * Uses pdfjs-dist for parsing (loaded dynamically)
 */
export async function parsePDF(file) {
  try {
    // Dynamic import using computed string to avoid Vite static analysis
    const pdfModule = 'pdfjs-dist';
    let pdfjs;
    
    try {
      // Use dynamic require-like pattern
      pdfjs = await import(/* @vite-ignore */ pdfModule);
    } catch {
      throw new Error('PDF parsing library not available. Please install pdfjs-dist: npm install pdfjs-dist');
    }

    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    
    const pages = [];
    for (let i = 0; i < pdf.numPages; i++) {
      const page = await pdf.getPage(i + 1);
      const textContent = await page.getTextContent();
      const text = textContent.items.map(item => item.str).join(' ');
      pages.push({
        pageNumber: i + 1,
        content: text
      });
    }

    return pages;
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
}

/**
 * Parse DOCX file and extract text
 * Uses basic text extraction (DOCX format varies)
 */
export async function parseDOCX(file) {
  try {
    // DOCX files are ZIP archives with XML inside
    // For simplicity, we extract text by reading as text
    // Note: This is a basic approach - for production, consider using:
    // mammoth.js or docx-parser library
    
    const text = await file.text();
    
    // Filter out XML tags if any are visible
    const cleanText = text
      .replace(/<[^>]*>/g, ' ')  // Remove XML/HTML tags
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();
    
    return [{
      pageNumber: 1,
      content: cleanText || 'DOCX content could not be extracted. Please try uploading as PDF or TXT.'
    }];
  } catch (error) {
    console.error('DOCX parsing error:', error);
    throw new Error('Failed to parse DOCX file. Please ensure it is a valid Word document or use PDF/TXT format.');
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
