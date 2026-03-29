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

describe('CollapsibleTree — no inline unlock banner', () => {
  test('never shows the old Parent topic unlocked! banner regardless of state', () => {
    render(
      <CollapsibleTree
        treeData={makeTree()}
        onNodeClick={() => {}}
        completedNodes={new Set()}
      />
    );
    expect(screen.queryByText('Parent topic unlocked!')).not.toBeInTheDocument();
  });
});
