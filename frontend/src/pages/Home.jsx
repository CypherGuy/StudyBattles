import { useState } from 'react';
import CollapsibleTree from '../components/CollapsibleTree';

export default function Home() {
  const [file, setFile] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [documentId, setDocumentId] = useState(null);
  const [tree, setTree] = useState(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [completedNodePaths, setCompletedNodePaths] = useState(new Set());

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

  const isNodeCompleted = (nodePath) => {
    return nodePath && completedNodePaths.has(nodePath);
  };

  const calculateNodeLocked = (node) => {
    // Leaf nodes (no children) are always unlocked
    if (!node.children || node.children.length === 0) {
      return false;
    }
    // Node is locked if not all children are completed
    const allChildrenCompleted = node.children.every(child => {
      if (!child.path) {
        console.warn('Node missing path:', child.title);
        return false; // If missing path, consider uncompleted
      }
      return isNodeCompleted(child.path);
    });
    return !allChildrenCompleted;
  };

  const updateTreeWithLockStatus = (node) => {
    // Recursively update lock status based on completed children
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => updateTreeWithLockStatus(child));
    }
    node.locked = calculateNodeLocked(node);
  };

  const handleNodeClick = async (node, depth) => {
    const level = depth + 1;
    if (level < 2) return; // Only level 2 and above
    if (node.locked) return; // Only unlocked nodes

    setSelectedNode(node);
    setQuestionsLoading(true);
    setQuestions(null);

    try {
      // Properly encode the path - encode each segment but keep slashes
      const encodedPath = node.path
        .split('/')
        .map(part => encodeURIComponent(part))
        .join('/');
      
      const url = `http://localhost:8000/api/questions/${tree.tree_id}/${encodedPath}`;

      // Add a timeout to the fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout for question generation

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      setQuestions(data.questions || []);
      
      // Mark this node as completed
      const newCompleted = new Set(completedNodePaths);
      newCompleted.add(node.path);
      setCompletedNodePaths(newCompleted);
      
      // Update tree with new lock status and trigger re-render
      if (tree) {
        const updatedTree = JSON.parse(JSON.stringify(tree)); // Deep copy
        updateTreeWithLockStatus(updatedTree.root);
        setTree(updatedTree);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        setMessage('Request timed out after 30 seconds. Questions may still be generating.');
      } else {
        console.error('Error fetching questions:', error);
        setMessage(`Error fetching questions: ${error.message}`);
      }
      setQuestions([]);
    } finally {
      setQuestionsLoading(false);
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
        // Update lock status based on completed nodes (initially empty)
        updateTreeWithLockStatus(data.root);
        setTree(data);
        setCompletedNodePaths(new Set()); // Reset completed nodes for new tree
        setMessage('Tree generated successfully!');
        setSelectedNode(null);
        setQuestions(null);
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
        <>
          <div style={{ marginTop: '30px' }}>
            <CollapsibleTree treeData={tree.root} onNodeClick={handleNodeClick} />
          </div>

          {selectedNode && (
            <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
              <h2>{selectedNode.title}</h2>
              {questionsLoading ? (
                <p>Loading questions...</p>
              ) : questions && questions.length > 0 ? (
                <div>
                  {questions.map((q, idx) => (
                    <div key={idx} style={{ marginBottom: '20px', padding: '15px', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #eee' }}>
                      <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>Q{idx + 1}: {q.question}</h3>
                      <div style={{ marginLeft: '20px' }}>
                        <strong>Answer points:</strong>
                        <ul style={{ marginTop: '8px' }}>
                          {q.answer && q.answer.map((ans, i) => (
                            <li key={i} style={{ marginBottom: '6px' }}>{ans}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No questions available for this node.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
