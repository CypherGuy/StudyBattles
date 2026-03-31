import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../pages/Home';

const generatedTree = {
  tree_id: 'tree-new-123',
  root: {
    title: 'Machine Learning',
    path: 'Machine Learning',
    locked: false,
    children: [
      { title: 'Supervised Learning', path: 'Machine Learning/Supervised Learning', locked: true, completed: false, children: [] },
    ],
  },
};

const sessionResponse = {
  session_id: 'sess-new-abc',
  node_unlock_status: {
    'Machine Learning': 'available',
    'Machine Learning/Supervised Learning': 'locked',
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

describe('Home — localStorage saved after tree generation', () => {
  test('saves session_id to localStorage after successful tree generation', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ document_id: 'doc-abc' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(generatedTree),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(sessionResponse),
      });

    renderHome();

    const file = new File(['content'], 'notes.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    fireEvent.click(screen.getByText('Upload'));

    await screen.findByText('Generate Tree');
    fireEvent.click(screen.getByText('Generate Tree'));

    await waitFor(() => {
      expect(localStorage.getItem('session_id')).toBe('sess-new-abc');
    });
  });

  test('saves tree_data to localStorage after successful tree generation', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ document_id: 'doc-abc' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(generatedTree),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(sessionResponse),
      });

    renderHome();

    const file = new File(['content'], 'notes.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    fireEvent.click(screen.getByText('Upload'));

    await screen.findByText('Generate Tree');
    fireEvent.click(screen.getByText('Generate Tree'));

    await waitFor(() => {
      const stored = localStorage.getItem('tree_data');
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored).tree_id).toBe('tree-new-123');
    });
  });
});

describe('Home — tree shown immediately from localStorage on mount', () => {
  test('renders the tree without waiting for backend when localStorage has tree data', () => {
    localStorage.setItem('session_id', 'sess-existing');
    localStorage.setItem('tree_data', JSON.stringify(generatedTree));

    // Backend fetch never resolves during this test
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    renderHome();

    // Tree title should be visible immediately (synchronously), not after a wait
    expect(screen.getByText('Machine Learning')).toBeInTheDocument();
  });

  test('does not show the upload form when tree data is in localStorage', () => {
    localStorage.setItem('session_id', 'sess-existing');
    localStorage.setItem('tree_data', JSON.stringify(generatedTree));

    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    renderHome();

    expect(screen.queryByText('Upload')).not.toBeInTheDocument();
  });
});

describe('Home — session persistence across navigation', () => {
  test('does not show the upload card when returning from a question page', () => {
    // Simulate having navigated away and back — localStorage still has data
    localStorage.setItem('session_id', 'sess-persisted');
    localStorage.setItem('tree_data', JSON.stringify(generatedTree));

    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        session_id: 'sess-persisted',
        node_unlock_status: {
          'Machine Learning': 'available',
          'Machine Learning/Supervised Learning': 'locked',
        },
      }),
    });

    renderHome();

    expect(screen.queryByText('Upload')).not.toBeInTheDocument();
    expect(screen.getByText('Machine Learning')).toBeInTheDocument();
  });
});
