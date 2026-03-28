import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CollapsibleTree from '../components/CollapsibleTree';

const makeTree = () => ({
  title: 'Root', path: 'Root', locked: false,
  children: [
    { title: 'Child1', path: 'Root/Child1', locked: false, children: [] },
    { title: 'Child2', path: 'Root/Child2', locked: false, children: [] },
  ],
});

describe('CollapsibleTree — completed state', () => {
  test('shows Completed badge on a node whose path is in completedNodes', () => {
    render(
      <CollapsibleTree
        treeData={makeTree()}
        onNodeClick={() => {}}
        completedNodes={new Set(['Root/Child1'])}
      />
    );
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  test('does not show Completed badge when completedNodes is empty', () => {
    render(
      <CollapsibleTree
        treeData={makeTree()}
        onNodeClick={() => {}}
        completedNodes={new Set()}
      />
    );
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  test('shows Completed badge only on the specific completed node', () => {
    render(
      <CollapsibleTree
        treeData={makeTree()}
        onNodeClick={() => {}}
        completedNodes={new Set(['Root/Child1'])}
      />
    );
    // Only one badge — Child2 is not completed
    expect(screen.getAllByText('Completed')).toHaveLength(1);
  });
});
