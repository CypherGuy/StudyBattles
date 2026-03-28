import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CollapsibleTree from '../components/CollapsibleTree';
import { detectNewlyUnlocked } from '../utils/detectNewlyUnlocked';

export default function Home() {
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [documentId, setDocumentId] = useState(null);
  const [tree, setTree] = useState(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [newlyUnlocked, setNewlyUnlocked] = useState(new Set());
  const [completedNodes, setCompletedNodes] = useState(new Set());

  // On mount, restore tree and session from localStorage if available
  useEffect(() => {
    const storedSession = localStorage.getItem('session_id');
    const storedTree = localStorage.getItem('tree_data');
    if (storedSession && storedTree) {
      const parsedTree = JSON.parse(storedTree);
      setSessionId(storedSession);
      setTree(parsedTree);
    }
  }, []);

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

  // Apply server-side unlock status to tree nodes
  const applyUnlockStatus = (node, unlockStatus) => {
    if (node.path && node.path in unlockStatus) {
      const status = unlockStatus[node.path];
      node.locked = status === "locked";
      node.completed = status === "completed";
    }
    if (node.children) {
      node.children.forEach(child => applyUnlockStatus(child, unlockStatus));
    }
  };

  const handleNodeClick = (node, depth) => {
    if (depth < 1 || node.locked) return;
    navigate('/question', { state: { node, treeId: tree.tree_id, sessionId } });
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

      if (!response.ok) {
        setMessage(`Error: ${data.error || 'Failed to generate tree'}`);
        return;
      }

      // Create a session for this tree to track unlock status server-side
      const sessionRes = await fetch(`http://localhost:8000/session?tree_id=${data.tree_id}`, {
        method: 'POST',
      });
      const sessionData = await sessionRes.json();

      setSessionId(sessionData.session_id);

      // Apply server unlock status to the tree before rendering
      applyUnlockStatus(data.root, sessionData.node_unlock_status);
      setTree(data);

      // Persist so state survives navigation back from QuestionScreen
      localStorage.setItem('session_id', sessionData.session_id);
      localStorage.setItem('tree_data', JSON.stringify(data));

      setMessage('Tree generated successfully!');
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setTreeLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!sessionId) return;

    try {
      const res = await fetch(`http://localhost:8000/session/${sessionId}`);
      const data = await res.json();

      // Detect parent nodes that just transitioned locked→unlocked
      const justUnlocked = detectNewlyUnlocked(tree.root, data.node_unlock_status);
      setNewlyUnlocked(justUnlocked);

      // Derive completed nodes directly from the node's unlock status
      setCompletedNodes(new Set(Object.keys(data.node_unlock_status).filter(k => data.node_unlock_status[k] === "completed")));

      // Re-apply updated unlock status to the tree
      const updatedTree = JSON.parse(JSON.stringify(tree)); // Deep copy
      applyUnlockStatus(updatedTree.root, data.node_unlock_status);
      setTree(updatedTree);
    } catch (error) {
      console.error('Error refreshing session:', error);
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
        <div style={{ marginTop: '30px' }}>
          <button
            onClick={handleRefresh}
            style={{ marginBottom: '10px', padding: '6px 14px' }}
          >
            Refresh unlock status
          </button>
          <CollapsibleTree treeData={tree.root} onNodeClick={handleNodeClick} newlyUnlocked={newlyUnlocked} completedNodes={completedNodes} />
        </div>
      )}
    </div>
  );
}
