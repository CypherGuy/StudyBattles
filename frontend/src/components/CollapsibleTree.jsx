import React, { useState } from 'react';
import './CollapsibleTree.css';
import { Lock, Unlock } from 'lucide-react';

const TreeNode = ({ node, depth = 0, onNodeClick, completedNodes = new Set() }) => {
  const [isExpanded, setIsExpanded] = useState(depth < 3);
  const hasChildren = node.children && node.children.length > 0;
  const levelNumber = depth + 1;
  const isCompleted = completedNodes.has(node.path);

  const handleClick = () => {
    if (onNodeClick && depth >= 1) {
      onNodeClick(node, depth);
    }
  };

  return (
    <div className="tree-node-wrapper">
      <div className="tree-node-line">
        {hasChildren ? (
          <button
            className="expand-button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <svg
              width="10" height="10" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.8"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ) : (
          <div className="expand-spacer" />
        )}

        <div
          className={`node-card ${node.locked ? 'locked' : 'unlocked'} ${isCompleted ? 'completed' : ''} ${depth >= 1 && !node.locked ? 'clickable' : ''}`}
          onClick={handleClick}
        >
          <div className="node-icon">
            {node.locked
              ? <Lock size={13} className="lock-icon" />
              : <Unlock size={13} className="unlock-icon" />
            }
          </div>
          <div className="node-content">
            <div className="node-title">{node.title}</div>
            {node.locked && hasChildren && (
              <div className="node-prereq">{node.children.length} req</div>
            )}
            {!node.locked && !isCompleted && (
              <div className="node-unlocked">Available</div>
            )}
            {isCompleted && (
              <div className="node-completed">Completed</div>
            )}
          </div>
          <div className="node-level">{levelNumber}</div>
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div className="children-container">
          {node.children.map((child, idx) => (
            <TreeNode
              key={idx}
              node={child}
              depth={depth + 1}
              onNodeClick={onNodeClick}
              completedNodes={completedNodes}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const CollapsibleTree = ({ treeData, onNodeClick, completedNodes = new Set() }) => {
  return (
    <div className="collapsible-tree-container">
      <div className="tree-header">
        <h2>Learning Hierarchy</h2>
        <p className="tree-subtitle">
          <span className="tree-legend-item">
            <span className="tree-legend-dot" style={{ background: 'rgba(74,222,128,0.65)' }} /> Unlocked
          </span>
          <span className="tree-legend-item">
            <span className="tree-legend-dot" style={{ background: 'rgba(96,165,250,0.75)' }} /> Mastered
          </span>
          <span className="tree-legend-item">
            <span className="tree-legend-dot" style={{ background: 'rgba(248,113,113,0.55)' }} /> Locked
          </span>
        </p>
      </div>
      <div className="tree-content">
        <TreeNode node={treeData} depth={0} onNodeClick={onNodeClick} completedNodes={completedNodes} />
      </div>
    </div>
  );
};

export default CollapsibleTree;
