import { useState, useEffect, useRef } from 'react';
import { Upload, Trash2, FileText, Loader } from 'lucide-react';
import { useApp } from '../context/AppState';
import { canPerform } from '../auth/permissions';
import { processDocument, validateDocumentFile } from '../services/documentService';
import { createDocumentMetadata, deleteDocument, deleteDocumentMetadata, storeDocumentChunks, listDocuments } from '../services/ragService';
import './KnowledgeBase.css';

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / (1024 ** index);
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
};

const getFileTypeLabel = (file) => file.name.split('.').pop()?.toUpperCase() || 'FILE';

export default function KnowledgeBase() {
  const { roleKey } = useApp();
  const canManageKnowledge = canPerform(roleKey, 'knowledge.manage');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  // Auto-clear success/error messages after 5 seconds
  useEffect(() => {
    if (!success && !error) return;
    const timer = setTimeout(() => { setSuccess(''); setError(''); }, 5000);
    return () => clearTimeout(timer);
  }, [success, error]);

  // Ref to the hidden file input — we trigger it when the button is clicked
  useEffect(() => {
    let active = true;
    listDocuments(roleKey)
      .then((docs) => { if (active) setDocuments(docs); })
      .catch((err) => {
        console.error('Error loading documents:', err);
        if (active) setError('Failed to load documents');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [roleKey]);

  async function loadDocuments() {
    setLoading(true);
    try {
      const docs = await listDocuments(roleKey);
      setDocuments(docs);
    } catch (err) {
      console.error('Error loading documents:', err);
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setError('');
    setSuccess('');
  }

  const handleFileUpload = async () => {
    if (!selectedFile || uploading) return;
    const file = selectedFile;

    setError('');
    setSuccess('');
    setUploading(true);

    try {
      // Validate file
      validateDocumentFile(file);

      // Warn on duplicate filename (prevents polluting KB with repeat uploads)
      const existingDoc = documents.find(d => d.title === file.name);
      if (existingDoc && !confirm(`"${file.name}" already exists in the Knowledge Base. Upload again? This will create duplicate chunks.`)) {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Process document (parse + chunk)
      const processedDoc = await processDocument(file);

      // Generate document ID
      const docId = `doc_${Date.now()}`;

      await createDocumentMetadata({
        id: docId,
        title: processedDoc.fileName,
        file_type: processedDoc.fileType,
        total_chunks: processedDoc.totalChunks,
        total_pages: processedDoc.totalPages,
        created_at: new Date().toISOString()
      }, roleKey);

      // Store chunks with embeddings in knowledge_base table
      // This is now graceful — returns 0 on failure instead of throwing
      const chunksStored = await storeDocumentChunks(docId, processedDoc.fileName, processedDoc.chunks, roleKey);

      if (chunksStored > 0) {
        setSelectedFile(null);
        setSuccess(`✓ ${processedDoc.fileName} uploaded successfully (${chunksStored} chunks indexed)`);
      } else {
        // Document was parsed but chunks couldn't be stored (DB issue) — Precious: still clear file
        setSelectedFile(null);
        setSuccess(`✓ ${processedDoc.fileName} parsed (${processedDoc.totalChunks} chunks) but storage may have failed — check console for details`);
      }
      await loadDocuments();
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Unable to upload the document. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!confirm('Delete this document and all its indexed chunks?')) return;

    try {
      await deleteDocument(docId, roleKey);
      await deleteDocumentMetadata(docId, roleKey);

      setSuccess('Document deleted successfully');
      await loadDocuments();
    } catch (err) {
      console.error('Delete error:', err);
      setError('Failed to delete document');
    }
  };

  return (
    <div className="knowledge-base-page">
      <h1>{canManageKnowledge ? 'Knowledge Base Management' : 'Knowledge Base'}</h1>
      <p className="subtitle">{canManageKnowledge ? 'Upload and manage documents for AI knowledge grounding' : 'Browse approved resources used by the DEVCON Kids assistant'}</p>

      {error && <div className="alert alert-error" role="alert" aria-live="assertive">{error}</div>}
      {success && <div className="alert alert-success" role="status" aria-live="polite">{success}</div>}

      {canManageKnowledge && <div className="upload-section">
        <div className="upload-box">
          <div className="upload-icon"><Upload size={32} aria-hidden="true" /></div>
          <h3>Upload Documents</h3>
          <p>Choose a PDF, DOCX, or TXT file to add it to the AI knowledge base.</p>
          <input
            id="knowledge-base-file"
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            disabled={uploading}
            accept=".pdf,.docx,.txt"
            className="file-input"
            aria-describedby="upload-requirements"
          />
          <p id="upload-requirements" className="upload-requirements">Supported formats: PDF, DOCX, TXT · Maximum file size: 50MB</p>
          <label
            htmlFor="knowledge-base-file"
            className={`upload-btn select-file-btn ${uploading ? 'is-disabled' : ''}`}
            role="button"
            tabIndex={uploading ? -1 : 0}
            aria-disabled={uploading}
            onKeyDown={(event) => {
              if (!uploading && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            Select File
          </label>
          {selectedFile && <div className="selected-file" aria-live="polite"><FileText size={20} aria-hidden="true" /><div><span>Selected file</span><strong>{selectedFile.name}</strong><small>{getFileTypeLabel(selectedFile)} · {formatFileSize(selectedFile.size)}</small></div></div>}
          <button type="button" className="upload-btn process-upload-btn" onClick={handleFileUpload} disabled={!selectedFile || uploading}>
            {uploading ? (
              <>
                <Loader size={16} className="spinner" />
                Processing...
              </>
            ) : (
              'Upload Document'
            )}
          </button>
        </div>
      </div>}

      <div className="documents-section">
        <h2>Uploaded Documents ({documents.length})</h2>

        {loading ? (
          <div className="loading">
            <Loader size={32} className="spinner" />
            <p>Loading documents...</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} />
            <p>No documents uploaded yet</p>
            <small>Upload documents to build your AI knowledge base</small>
          </div>
        ) : (
          <div className="documents-table">
            <table>
              <thead>
                <tr>
                  <th>Document Title</th>
                  <th>Type</th>
                  <th>Chunks</th>
                  <th>Pages</th>
                  <th>Uploaded</th>
                  {canManageKnowledge && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {documents.map(doc => (
                  <tr key={doc.id}>
                    <td className="title-cell">
                      <span className="document-title-content">
                        <FileText size={16} />
                        <span>{doc.title}</span>
                      </span>
                    </td>
                    <td>{doc.file_type.toUpperCase()}</td>
                    <td>{doc.total_chunks}</td>
                    <td>{doc.total_pages}</td>
                    {canManageKnowledge && <td>
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>}
                    <td>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="delete-btn"
                        title="Delete document"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="info-section">
        <h3>About Knowledge Base</h3>
        <ul>
          <li><strong>Document Types:</strong> PDF, DOCX, TXT</li>
          <li><strong>Max File Size:</strong> 50MB</li>
          <li><strong>Processing:</strong> Documents are automatically chunked and indexed with embeddings</li>
          <li><strong>AI Grounding:</strong> Uploaded documents are used to ground chatbot responses when embeddings are available</li>
          <li><strong>Search:</strong> Semantic search matches user queries to relevant document chunks</li>
        </ul>
      </div>
    </div>
  );
}
