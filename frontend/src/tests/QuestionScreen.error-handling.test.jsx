import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import QuestionScreen from '../pages/QuestionScreen';

const mockQuestion = {
  type: 'Definition',
  question: 'What is SQL injection?',
  answer: ['A technique where malicious SQL is inserted into a query'],
};

const locationState = {
  node: { title: 'SQL Injection', path: 'CS/SQL Injection' },
  treeId: 'tree123',
  sessionId: 'sess456',
};

const noCompleted = { json: () => Promise.resolve({ completed_questions: [] }) };

function renderQuestionScreen(state = locationState) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/question', state }]}>
      <Routes>
        <Route path="/question" element={<QuestionScreen />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => vi.restoreAllMocks());

describe('QuestionScreen — question fetch error handling', () => {
  test('shows an error message when question fetch fails with a network error', async () => {
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce(noCompleted);

    renderQuestionScreen();

    expect(await screen.findByText(/failed to load questions/i)).toBeInTheDocument();
  });

  test('shows a timeout error message when question fetch times out', async () => {
    global.fetch = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('AbortError'), { name: 'AbortError' }))
      .mockResolvedValueOnce(noCompleted);

    renderQuestionScreen();

    expect(await screen.findByText(/timed out/i)).toBeInTheDocument();
  });
});

describe('QuestionScreen — evaluation error handling', () => {
  test('shows an error message when answer evaluation fails', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ questions: [mockQuestion] }) })
      .mockResolvedValueOnce(noCompleted)
      .mockRejectedValueOnce(new Error('Network error'));

    renderQuestionScreen();

    const textarea = await screen.findByPlaceholderText('Type your answer here...');
    fireEvent.change(textarea, { target: { value: 'some answer' } });
    fireEvent.click(screen.getByText('Submit'));

    expect(await screen.findByText(/failed to evaluate/i)).toBeInTheDocument();
  });

  test('clears the evaluating state after evaluation fails', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ questions: [mockQuestion] }) })
      .mockResolvedValueOnce(noCompleted)
      .mockRejectedValueOnce(new Error('Network error'));

    renderQuestionScreen();

    const textarea = await screen.findByPlaceholderText('Type your answer here...');
    fireEvent.change(textarea, { target: { value: 'some answer' } });
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(screen.queryByText(/evaluating/i)).not.toBeInTheDocument();
    });
  });
});

describe('QuestionScreen — new question error handling', () => {
  test('shows an error message when new question generation fails', async () => {
    const mockResult = {
      marks_received: 0,
      marks_total: 1,
      key_points_hit: [],
      feedback: 'Not quite.',
    };

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ questions: [mockQuestion] }) })
      .mockResolvedValueOnce(noCompleted)
      .mockResolvedValueOnce({ json: () => Promise.resolve(mockResult) })
      .mockRejectedValueOnce(new Error('Network error'));

    renderQuestionScreen();

    const textarea = await screen.findByPlaceholderText('Type your answer here...');
    fireEvent.change(textarea, { target: { value: 'some answer' } });
    fireEvent.click(screen.getByText('Submit'));

    await screen.findByText('New question');
    fireEvent.click(screen.getByText('New question'));

    expect(await screen.findByText(/failed to generate/i)).toBeInTheDocument();
  });
});
