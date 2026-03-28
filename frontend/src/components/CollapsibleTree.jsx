import React, { useState } from 'react';
import './CollapsibleTree.css';
import { ChevronRight, ChevronDown, Lock, Unlock } from 'lucide-react';

const TreeNode = ({ node, parentTitle, depth = 0, onNodeClick, newlyUnlocked = new Set() }) => {
  const [isExpanded, setIsExpanded] = useState(depth < 2); // Auto-expand first 2 levels
  const hasChildren = node.children && node.children.length > 0;
  const levelNumber = depth + 1; // Convert 0-indexed depth to 1-indexed level
  const isNewlyUnlocked = hasChildren && newlyUnlocked.has(node.path);

  const handleClick = () => {
    if (onNodeClick && depth >= 1) { // level 2 and above (depth >= 1)
      onNodeClick(node, depth);
    }
  };

  return (
    <div className="tree-node-wrapper">
      <div className="tree-node-line" style={{ marginLeft: `${depth * 24}px` }}>
        <div className="node-controls">
          {hasChildren && (
            <button
              className="expand-button"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                <ChevronDown size={18} />
              ) : (
                <ChevronRight size={18} />
              )}
            </button>
          )}
          {!hasChildren && <div className="expand-spacer" />}
        </div>

        <div
          className={`node-card ${node.locked ? 'locked' : 'unlocked'} ${depth >= 1 && !node.locked ? 'clickable' : ''} ${isNewlyUnlocked ? 'newly-unlocked' : ''}`}
          onClick={handleClick}
        >
          <div className="node-icon">
            {node.locked ? (
              <Lock size={16} className="lock-icon" />
            ) : (
              <Unlock size={16} className="unlock-icon" />
            )}
          </div>
          <div className="node-content">
            <div className="node-title">{node.title}</div>
            {node.locked && hasChildren && (
              <div className="node-prereq">
                Complete {node.children.length} child{node.children.length !== 1 ? 'ren' : ''}
              </div>
            )}
            {!node.locked && (
              <div className="node-unlocked">Available</div>
            )}
            {isNewlyUnlocked && (
              <div className="node-unlock-banner">Parent topic unlocked!</div>
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
              parentTitle={node.title}
              depth={depth + 1}
              onNodeClick={onNodeClick}
              newlyUnlocked={newlyUnlocked}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const CollapsibleTree = ({ treeData, onNodeClick, newlyUnlocked = new Set() }) => {
  return (
    <div className="collapsible-tree-container">
      <div className="tree-header">
        <h2>Learning Hierarchy</h2>
        <p className="tree-subtitle">Green = Unlocked, Red = Locked</p>
      </div>
      <div className="tree-content">
        <TreeNode node={treeData} depth={0} onNodeClick={onNodeClick} newlyUnlocked={newlyUnlocked} />
      </div>
    </div>
  );
};

export default CollapsibleTree;
