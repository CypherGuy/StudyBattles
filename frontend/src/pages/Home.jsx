import { useState } from 'react';

export default function Home() {
  const [file, setFile] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [documentId, setDocumentId] = useState(null);
  const [tree, setTree] = useState(null);
  const [treeLoading, setTreeLoading] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      const droppedFile = droppedFiles[0];
      const validTypes = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
                         'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
      
      if (validTypes.includes(droppedFile.type) || 
          droppedFile.name.endsWith('.docx') || 
          droppedFile.name.endsWith('.pptx')) {
        setFile(droppedFile);
        setMessage('');
      } else {
        setMessage('Error: Only .docx and .pptx files are supported');
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage('Please select a file');
      return;
    }

    setLoading(true);
    setMessage('');

    const formData = new FormData();
    formData.append('files', file);

    try {
      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('File uploaded successfully!');
        // Store document ID from response if available
        if (data.document_id) {
          setDocumentId(data.document_id);
        }
        setFile(null);
        document.getElementById('fileInput').value = '';
      } else {
        setMessage(`Error: ${data.detail || 'Upload failed'}`);
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleYoutubeUpload = async () => {
    if (!youtubeUrl.trim()) {
      setMessage('Please enter a YouTube URL');
      return;
    }

    setLoading(true);
    setMessage('');

    const formData = new FormData();
    formData.append('url', youtubeUrl);

    try {
      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('YouTube video uploaded successfully!');
        // Store document ID from response if available
        if (data.document_id) {
          setDocumentId(data.document_id);
        }
        setYoutubeUrl('');
      } else {
        setMessage(`Error: ${data.detail || 'Upload failed'}`);
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateTree = async () => {
    if (!documentId) {
      setMessage('Please upload a document first');
      return;
    }

    setTreeLoading(true);
    setMessage('Generating learning tree...');

    try {
      const response = await fetch(`http://localhost:8000/generate-tree?document_id=${documentId}`, {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setTree(data);
        setMessage('Tree generated successfully!');
      } else {
        setMessage(`Error: ${data.error || 'Failed to generate tree'}`);
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setTreeLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>StudyBattles</h1>
      
      <div style={{ marginTop: '20px' }}>
        <h2>Upload Document</h2>
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            padding: '40px',
            border: '2px dashed #ccc',
            borderRadius: '8px',
            textAlign: 'center',
            backgroundColor: dragOver ? '#f0f0f0' : 'transparent',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}
        >
          <p>Drag and drop your .docx or .pptx files here, or use the input below</p>
          <input
            id="fileInput"
            type="file"
            accept=".docx,.pptx"
            onChange={handleFileChange}
            disabled={loading}
            style={{ marginBottom: '10px' }}
          />
        </div>
        
        {file && (
          <p style={{ marginTop: '10px', fontWeight: 'bold' }}>
            Selected file: {file.name}
          </p>
        )}
        
        <button
          onClick={handleUpload}
          disabled={loading || !file}
          style={{ marginTop: '10px', padding: '8px 16px' }}
        >
          {loading ? 'Uploading...' : 'Upload'}
        </button>
      </div>

      <div style={{ marginTop: '30px' }}>
        <h2>Upload YouTube Video</h2>
        <input
          type="text"
          placeholder="https://www.youtube.com/watch?v=..."
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          disabled={loading}
          style={{ padding: '8px', width: '350px' }}
        />
        <button
          onClick={handleYoutubeUpload}
          disabled={loading}
          style={{ marginLeft: '10px', padding: '8px 16px' }}
        >
          {loading ? 'Uploading...' : 'Upload'}
        </button>
      </div>

      {documentId && (
        <div style={{ marginTop: '30px' }}>
          <h2>Generate Learning Tree</h2>
          <button
            onClick={handleGenerateTree}
            disabled={treeLoading}
            style={{ padding: '8px 16px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            {treeLoading ? 'Generating...' : 'Generate Tree'}
          </button>
        </div>
      )}

      {message && (
        <p style={{
          marginTop: '20px',
          color: message.includes('Error') ? 'red' : 'green',
          fontSize: '16px'
        }}>
          {message}
        </p>
      )}

      {tree && (
        <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#2662b0', borderRadius: '8px' }}>
          <h2>Learning Tree</h2>
          <pre style={{ overflow: 'auto', maxHeight: '500px', padding: '10px', backgroundColor: '#164568', borderRadius: '4px' }}>
            {JSON.stringify(tree.root, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
