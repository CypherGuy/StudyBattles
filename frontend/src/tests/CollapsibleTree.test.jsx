import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CollapsibleTree from '../components/CollapsibleTree';

const makeTree = (overrides = {}) => ({
  title: 'Root',
  path: 'Root',
  locked: false,
  children: [
    { title: 'Child1', path: 'Root/Child1', locked: false, children: [] },
  ],
  ...overrides,
});

describe('CollapsibleTree — unlock banner', () => {
  test('shows unlock banner on a node whose path is in newlyUnlocked', () => {
    render(
      <CollapsibleTree
        treeData={makeTree()}
        onNodeClick={() => {}}
        newlyUnlocked={new Set(['Root'])}
      />
    );
    expect(screen.getByText('Parent topic unlocked!')).toBeInTheDocument();
  });

  test('does not show unlock banner on nodes not in newlyUnlocked', () => {
    render(
      <CollapsibleTree
        treeData={makeTree()}
        onNodeClick={() => {}}
        newlyUnlocked={new Set()}
      />
    );
    expect(screen.queryByText('Parent topic unlocked!')).not.toBeInTheDocument();
  });

  test('shows banner only on the specific newly-unlocked node, not all nodes', () => {
    const tree = makeTree();
    render(
      <CollapsibleTree
        treeData={tree}
        onNodeClick={() => {}}
        newlyUnlocked={new Set(['Root/Child1'])}
      />
    );
    const banners = screen.queryAllByText('Parent topic unlocked!');
    expect(banners).toHaveLength(0); // Child1 is a leaf, banner only for parents
  });
});
