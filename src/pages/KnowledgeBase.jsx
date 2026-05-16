import React, { useState, useEffect } from 'react';
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

      // Process document
      const processedDoc = await processDocument(file);

      // Generate document ID
      const docId = `doc_${Date.now()}`;

      // Store in Supabase documents table
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .insert([{
          id: docId,
          title: processedDoc.fileName,
          file_type: processedDoc.fileType,
          total_chunks: processedDoc.totalChunks,
          total_pages: processedDoc.totalPages,
          created_at: new Date().toISOString()
        }])
        .select();

      if (docError) throw docError;

      // Store chunks with embeddings in knowledge_base table
      await storeDocumentChunks(docId, processedDoc.fileName, processedDoc.chunks);

      setSuccess(`✓ ${processedDoc.fileName} uploaded successfully (${processedDoc.totalChunks} chunks indexed)`);
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
            onChange={handleFileUpload}
            disabled={uploading}
            accept=".pdf,.docx,.txt"
            className="file-input"
          />
          <button className="upload-btn" disabled={uploading}>
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
          <li><strong>AI Grounding:</strong> Uploaded documents are used to ground Gemini AI responses</li>
          <li><strong>Search:</strong> Semantic search matches user queries to relevant document chunks</li>
        </ul>
      </div>
    </div>
  );
}
