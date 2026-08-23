import React, { useState, useEffect, useRef } from 'react';
import { Upload, Trash2, FileText, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { processDocument, validateDocumentFile } from '../services/documentService';
import { storeDocumentChunks, listDocuments, deleteDocument } from '../services/ragService';
import './KnowledgeBase.css';

export default function KnowledgeBase() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Auto-clear success/error messages after 5 seconds
  useEffect(() => {
    if (!success && !error) return;
    const timer = setTimeout(() => { setSuccess(''); setError(''); }, 5000);
    return () => clearTimeout(timer);
  }, [success, error]);

  // Ref to the hidden file input — we trigger it when the button is clicked
  const fileInputRef = useRef(null);
  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const docs = await listDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error('Error loading documents:', err);
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
        e.target.value = '';
        return;
      }

      // Process document (parse + chunk)
      const processedDoc = await processDocument(file);

      // Generate document ID
      const docId = `doc_${Date.now()}`;

      // Store in Supabase documents table
      const { error: docError } = await supabase
        .from('documents')
        .insert([{
          id: docId,
          title: processedDoc.fileName,
          file_type: processedDoc.fileType,
          total_chunks: processedDoc.totalChunks,
          total_pages: processedDoc.totalPages,
          created_at: new Date().toISOString()
        }]);

      if (docError) {
        // If documents table doesn't exist or RLS blocks, warn but continue
        console.error('[KnowledgeBase] Failed to save document metadata:', docError);
        console.warn('[KnowledgeBase] The "documents" table may not exist. Run the SQL migration.');
      }

      // Store chunks with embeddings in knowledge_base table
      // This is now graceful — returns 0 on failure instead of throwing
      const chunksStored = await storeDocumentChunks(docId, processedDoc.fileName, processedDoc.chunks);

      if (chunksStored > 0) {
        setSuccess(`✓ ${processedDoc.fileName} uploaded successfully (${chunksStored} chunks indexed)`);
      } else {
        // Document was parsed but chunks couldn't be stored (DB issue)
        setSuccess(`✓ ${processedDoc.fileName} parsed (${processedDoc.totalChunks} chunks) but storage may have failed — check console for details`);
      }
      await loadDocuments();
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload document');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!confirm('Delete this document and all its indexed chunks?')) return;

    try {
      await deleteDocument(docId);
      
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', docId);

      if (error) throw error;

      setSuccess('Document deleted successfully');
      await loadDocuments();
    } catch (err) {
      console.error('Delete error:', err);
      setError('Failed to delete document');
    }
  };

  return (
    <div className="knowledge-base-page">
      <h1>Knowledge Base Management</h1>
      <p className="subtitle">Upload and manage documents for AI knowledge grounding</p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="upload-section">
        <div className="upload-box">
          <Upload size={32} />
          <h3>Upload Documents</h3>
          <p>PDF, DOCX, or TXT files</p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            disabled={uploading}
            accept=".pdf,.docx,.txt"
            className="file-input"
          />
          <button
            className="upload-btn"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <>
                <Loader size={16} className="spinner" />
                Uploading...
              </>
            ) : (
              'Select File'
            )}
          </button>
        </div>
      </div>

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
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {documents.map(doc => (
                  <tr key={doc.id}>
                    <td className="title-cell">
                      <FileText size={16} />
                      {doc.title}
                    </td>
                    <td>{doc.file_type.toUpperCase()}</td>
                    <td>{doc.total_chunks}</td>
                    <td>{doc.total_pages}</td>
                    <td>
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>
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
