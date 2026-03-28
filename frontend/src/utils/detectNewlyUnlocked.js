/**
 * Walk the tree and return a Set of node paths that are parent nodes
 * (have children) and have just transitioned from locked=true to locked=false
 * according to the incoming newStatus map.
 */
export function detectNewlyUnlocked(node, newStatus) {
  const result = new Set();
  walk(node, newStatus, result);
  return result;
}

function walk(node, newStatus, result) {
  const hasChildren = node.children && node.children.length > 0;
  const isParent = hasChildren;
  const wasLocked = node.locked === true;
  const willUnlock = node.path in newStatus && newStatus[node.path] === false;

  if (isParent && wasLocked && willUnlock) {
    result.add(node.path);
  }

  if (hasChildren) {
    node.children.forEach(child => walk(child, newStatus, result));
  }
}
