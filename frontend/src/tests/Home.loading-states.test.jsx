import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../pages/Home';

const storedTree = {
  tree_id: 'tree456',
  root: {
    title: 'Root',
    path: 'Root',
    locked: false,
    children: [
      { title: 'Topic1', path: 'Root/Topic1', locked: false, completed: false, children: [] },
    ],
  },
};

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Home — refresh button loading state', () => {
  test('Refresh button is disabled while fetching unlock status', async () => {
    localStorage.setItem('session_id', 'sess123');
    localStorage.setItem('tree_data', JSON.stringify(storedTree));

    let resolveRefresh;
    const pendingRefresh = new Promise(resolve => { resolveRefresh = resolve; });

    global.fetch = vi.fn()
      // session restore on mount
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          session_id: 'sess123',
          node_unlock_status: { Root: 'available', 'Root/Topic1': 'available' },
        }),
      })
      // prefetch questions
      .mockResolvedValue({ json: () => Promise.resolve({ questions: [] }) });

    renderHome();
    await screen.findByText('Refresh unlock status');

    // Now set up the pending refresh
    global.fetch = vi.fn().mockReturnValueOnce({ json: () => pendingRefresh });

    fireEvent.click(screen.getByText('Refresh unlock status'));

    expect(screen.getByText('Refresh unlock status').closest('button')).toBeDisabled();

    // Cleanup
    resolveRefresh({
      node_unlock_status: { Root: 'available', 'Root/Topic1': 'available' },
    });
  });

  test('Refresh button is re-enabled after fetch completes', async () => {
    localStorage.setItem('session_id', 'sess123');
    localStorage.setItem('tree_data', JSON.stringify(storedTree));

    global.fetch = vi.fn()
      .mockResolvedValue({
        json: () => Promise.resolve({
          session_id: 'sess123',
          node_unlock_status: { Root: 'available', 'Root/Topic1': 'available' },
        }),
      });

    renderHome();
    await screen.findByText('Refresh unlock status');

    fireEvent.click(screen.getByText('Refresh unlock status'));

    await waitFor(() => {
      expect(screen.getByText('Refresh unlock status').closest('button')).not.toBeDisabled();
    });
  });
});
