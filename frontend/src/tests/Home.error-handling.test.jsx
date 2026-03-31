import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../pages/Home';

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

describe('Home — upload error handling', () => {
  test('shows error message when document upload fails with a network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    renderHome();

    const file = new File(['content'], 'notes.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    fireEvent.click(screen.getByText('Upload'));

    expect(await screen.findByText(/failed to fetch/i)).toBeInTheDocument();
  });

  test('shows error message when upload returns a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ detail: 'File too large' }),
    });

    renderHome();

    const file = new File(['content'], 'notes.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    fireEvent.click(screen.getByText('Upload'));

    expect(await screen.findByText(/file too large/i)).toBeInTheDocument();
  });
});

describe('Home — tree generation error handling', () => {
  test('shows error message when tree generation request times out', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ document_id: 'doc123' }),
      })
      .mockRejectedValueOnce(Object.assign(new Error('AbortError'), { name: 'AbortError' }));

    renderHome();

    const file = new File(['content'], 'notes.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    fireEvent.click(screen.getByText('Upload'));

    await screen.findByText('Generate Tree');
    fireEvent.click(screen.getByText('Generate Tree'));

    expect(await screen.findByText(/timed out/i)).toBeInTheDocument();
  });

  test('shows error message when tree generation fails with a network error', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ document_id: 'doc123' }),
      })
      .mockRejectedValueOnce(new Error('Network error'));

    renderHome();

    const file = new File(['content'], 'notes.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    fireEvent.click(screen.getByText('Upload'));

    await screen.findByText('Generate Tree');
    fireEvent.click(screen.getByText('Generate Tree'));

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
  });
});
