import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../pages/Home';

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  global.fetch = vi.fn().mockRejectedValue(new Error('network'));
});

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );
}

describe('Home — reset button', () => {
  test('reset button is visible when a tree is loaded', async () => {
    localStorage.setItem('session_id', 'sess123');
    localStorage.setItem('tree_data', JSON.stringify({
      tree_id: 'tree123',
      root: { title: 'Root', path: 'Root', locked: false, children: [] },
    }));

    renderHome();

    expect(await screen.findByText('Reset')).toBeInTheDocument();
  });

  test('reset button is not visible before a tree is loaded', () => {
    renderHome();
    expect(screen.queryByText('Reset')).not.toBeInTheDocument();
  });

  test('clicking Reset clears localStorage and removes the tree from view', async () => {
    localStorage.setItem('session_id', 'sess123');
    localStorage.setItem('tree_data', JSON.stringify({
      tree_id: 'tree123',
      root: { title: 'Root', path: 'Root', locked: false, children: [] },
    }));

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    renderHome();
    await screen.findByText('Reset');
    fireEvent.click(screen.getByText('Reset'));

    await waitFor(() => {
      expect(screen.queryByText('Reset')).not.toBeInTheDocument();
      expect(localStorage.getItem('session_id')).toBeNull();
      expect(localStorage.getItem('tree_data')).toBeNull();
    });
  });
});
