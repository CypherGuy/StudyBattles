import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CollapsibleTree from '../components/CollapsibleTree';
import API_BASE from '../api';
import './Home.css';

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
  const [completedNodes, setCompletedNodes] = useState(new Set());
  const [statusChanges, setStatusChanges] = useState([]); // [{ name, status }] from last refresh
  const [questionsByNode, setQuestionsByNode] = useState({}); // { nodePath: questions[] } prefetched on restore
  const [uploadMode, setUploadMode] = useState('file'); // 'file' | 'youtube'
  const [resetting, setResetting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // On mount, restore tree and session from localStorage, then sync unlock status from backend
  useEffect(() => {
    const storedSession = localStorage.getItem('session_id');
    const storedTree = localStorage.getItem('tree_data');
    if (!storedSession || !storedTree) return;

    const parsedTree = JSON.parse(storedTree);
    setSessionId(storedSession);
    setTree(parsedTree);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    fetch(`${API_BASE}/session/${storedSession}`, { signal: controller.signal })
      .then(res => { clearTimeout(timeoutId); return res.json(); })
      .then(data => {
        const updatedTree = JSON.parse(JSON.stringify(parsedTree));
        applyUnlockStatus(updatedTree.root, data.node_unlock_status);
        setTree(updatedTree);
        setCompletedNodes(
          new Set(Object.keys(data.node_unlock_status).filter(k => data.node_unlock_status[k] === 'completed'))
        );

        // Prefetch questions for all non-root unlocked nodes
        const rootPath = parsedTree.root.path;
        const unlockedPaths = Object.entries(data.node_unlock_status)
          .filter(([path, status]) => path !== rootPath && status !== 'locked')
          .map(([path]) => path);

        Promise.all(
          unlockedPaths.map(path => {
            const encodedPath = path.split('/').map(p => encodeURIComponent(p)).join('/');
            return fetch(`${API_BASE}/api/questions/${parsedTree.tree_id}/${encodedPath}`)
              .then(res => res.json())
              .then(d => [path, d.questions || []])
              .catch(() => null);
          })
        ).then(results => {
          const qMap = {};
          results.forEach(entry => { if (entry) qMap[entry[0]] = entry[1]; });
          setQuestionsByNode(qMap);
        });
      })
      .catch(() => {
        setTree(parsedTree);
      });
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
      const response = await fetch(`${API_BASE}/upload`, {
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
      const response = await fetch(`${API_BASE}/upload`, {
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
    navigate('/question', { state: { node, treeId: tree.tree_id, sessionId, questions: questionsByNode[node.path] || null } });
  };

  const handleGenerateTree = async () => {
    if (!documentId) {
      setMessage('Please upload a document first');
      return;
    }

    setTreeLoading(true);
    setMessage('Generating learning tree...');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(`${API_BASE}/generate-tree?document_id=${documentId}`, {
        method: 'POST',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        setMessage(`Error: ${data.error || 'Failed to generate tree'}`);
        return;
      }

      // Create a session for this tree to track unlock status server-side
      const sessionRes = await fetch(`${API_BASE}/session?tree_id=${data.tree_id}`, {
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
      if (error.name === 'AbortError') {
        setMessage('Error: Tree generation timed out — please try again.');
      } else {
        setMessage(`Error: ${error.message}`);
      }
    } finally {
      setTreeLoading(false);
    }
  };

  const handleReset = async () => {
    if (resetting) return;
    setResetting(true);
    if (sessionId) {
      try {
        await fetch(`${API_BASE}/session/${sessionId}`, { method: 'DELETE' });
      } catch (error) {
        console.error('Error deleting session:', error);
      }
    }
    localStorage.removeItem('session_id');
    localStorage.removeItem('tree_data');
    setTree(null);
    setSessionId(null);
    setDocumentId(null);
    setCompletedNodes(new Set());
    setStatusChanges([]);
    setMessage('');
  };

  const handleRefresh = async () => {
    if (!sessionId || refreshing) return;

    setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE}/session/${sessionId}`);
      const data = await res.json();

      // Compute which nodes changed status since last render
      const changes = [];
      const walkForChanges = (node) => {
        const newStatus = data.node_unlock_status[node.path];
        if (newStatus === 'available' && node.locked) changes.push({ name: node.title, status: 'Available' });
        if (newStatus === 'completed' && !node.completed) changes.push({ name: node.title, status: 'Completed' });
        (node.children || []).forEach(walkForChanges);
      };
      walkForChanges(tree.root);
      setStatusChanges(changes);

      // Derive completed nodes directly from the node's unlock status
      setCompletedNodes(new Set(Object.keys(data.node_unlock_status).filter(k => data.node_unlock_status[k] === 'completed')));

      // Re-apply updated unlock status to the tree
      const updatedTree = JSON.parse(JSON.stringify(tree)); // Deep copy
      applyUnlockStatus(updatedTree.root, data.node_unlock_status);
      setTree(updatedTree);
    } catch (error) {
      console.error('Error refreshing session:', error);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="home-page">

      {/* ── Header ── */}
      <header className="home-header">
        <h1 className="home-logo">Study<em>Battles</em></h1>
        <div className="home-logo-divider" />
      </header>

      {/* ── Upload card ── */}
      {!tree && (
        <div className="upload-card">

          {/* Tab strip */}
          <div className="upload-tabs">
            <button
              className={`upload-tab${uploadMode === 'file' ? ' active' : ''}`}
              onClick={() => setUploadMode('file')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              Document
            </button>
            <button
              className={`upload-tab${uploadMode === 'youtube' ? ' active' : ''}`}
              onClick={() => setUploadMode('youtube')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.96-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" />
                <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" />
              </svg>
              YouTube
            </button>
          </div>

          {/* File tab */}
          {uploadMode === 'file' && (
            <div className="file-tab-body">
              <div
                className={`drop-zone${dragOver ? ' drag-active' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="drop-zone-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                  </svg>
                </div>
                <p className="drop-zone-label">
                  Drop your file here or <span>browse</span>
                </p>
                <p className="drop-zone-hint">.docx and .pptx supported</p>
                <input
                  id="fileInput"
                  type="file"
                  accept=".docx,.pptx"
                  onChange={handleFileChange}
                  disabled={loading}
                />
              </div>

              {file && (
                <div className="file-chip">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="file-chip-name">{file.name}</span>
                  <button className="file-chip-clear" onClick={() => { setFile(null); document.getElementById('fileInput').value = ''; }}>×</button>
                </div>
              )}

              <div className="file-tab-footer">
                <button className="btn-upload" onClick={handleUpload} disabled={loading || !file}>
                  {loading ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </div>
          )}

          {/* YouTube tab */}
          {uploadMode === 'youtube' && (
            <div className="yt-tab-body">
              <p className="yt-field-label">Video URL</p>
              <div className="yt-input-row">
                <input
                  type="text"
                  className="yt-input"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  disabled={loading}
                />
                <button className="btn-upload" onClick={handleYoutubeUpload} disabled={loading}>
                  {loading ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Status message ── */}
      {message && (
        <div className={`status-msg${message.includes('Error') ? ' error' : ' success'}`}>
          <span className="status-dot" />
          {message}
        </div>
      )}

      {/* ── Generate Tree ── */}
      {documentId && !tree && (
        <div className="generate-section">
          <div className="generate-section-text">
            <p className="generate-section-title">Ready to generate</p>
            <p className="generate-section-sub">Build your personalised learning tree from the uploaded content</p>
          </div>
          <button className="btn-generate" onClick={handleGenerateTree} disabled={treeLoading}>
            {treeLoading ? (
              <>Generating…</>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                </svg>
                Generate Tree
              </>
            )}
          </button>
        </div>
      )}

      {/* ── Tree view ── */}
      {tree && (
        <div style={{ marginTop: '8px' }}>
          <div className="tree-toolbar">
            <button className="btn-toolbar" onClick={handleRefresh} disabled={refreshing}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Refresh unlock status
            </button>
            <button className="btn-toolbar danger" onClick={handleReset} disabled={resetting}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              Reset
            </button>
          </div>

          {statusChanges.length > 0 && (
            <div className="status-changes-banner">
              <p className="status-changes-title">Updated this refresh</p>
              <ul className="status-changes-list">
                {statusChanges.map((c, i) => (
                  <li key={i} style={{ color: c.status === 'Completed' ? '#60a5fa' : '#4ade80' }}>
                    {c.status === 'Completed' ? '✓' : '→'} <strong>{c.name}</strong> — {c.status}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <CollapsibleTree treeData={tree.root} onNodeClick={handleNodeClick} completedNodes={completedNodes} />
        </div>
      )}
    </div>
  );
}
