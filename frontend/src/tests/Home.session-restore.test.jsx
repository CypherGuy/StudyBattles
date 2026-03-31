import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../pages/Home';

const SESSION_ID = 'sess-restore-123';

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

describe('Home — session restore on mount', () => {
  test('fetches GET /session/{session_id} when session_id is in localStorage', async () => {
    localStorage.setItem('session_id', SESSION_ID);
    localStorage.setItem('tree_data', JSON.stringify(storedTree));

    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        session_id: SESSION_ID,
        node_unlock_status: { Root: 'available', 'Root/Topic1': 'available' },
      }),
    });

    renderHome();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `http://localhost:8000/session/${SESSION_ID}`,
        expect.objectContaining({ signal: expect.any(Object) })
      );
    });
  });

  test('shows Completed badge for a node the backend marks as completed', async () => {
    localStorage.setItem('session_id', SESSION_ID);
    localStorage.setItem('tree_data', JSON.stringify(storedTree));

    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        session_id: SESSION_ID,
        node_unlock_status: { Root: 'available', 'Root/Topic1': 'completed' },
      }),
    });

    renderHome();

    expect(await screen.findByText('Completed')).toBeInTheDocument();
  });

  test('still renders the tree if the backend fetch fails', async () => {
    localStorage.setItem('session_id', SESSION_ID);
    localStorage.setItem('tree_data', JSON.stringify(storedTree));

    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));

    renderHome();

    expect(await screen.findByText('Root')).toBeInTheDocument();
  });

  test('does not fetch session endpoint when localStorage has no session_id', () => {
    global.fetch = vi.fn();

    renderHome();

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('prefetches questions for non-root unlocked nodes after session restore', async () => {
    localStorage.setItem('session_id', SESSION_ID);
    localStorage.setItem('tree_data', JSON.stringify(storedTree));

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          session_id: SESSION_ID,
          node_unlock_status: { Root: 'available', 'Root/Topic1': 'available' },
        }),
      })
      .mockResolvedValue({
        json: () => Promise.resolve({ questions: [] }),
      });

    renderHome();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/questions/tree456/Root/Topic1'
      );
    });
  });
});
