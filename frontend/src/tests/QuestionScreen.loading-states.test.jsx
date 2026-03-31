import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import QuestionScreen from '../pages/QuestionScreen';

const mockQuestion = {
  type: 'Definition',
  question: 'What is SQL injection?',
  answer: ['A technique where malicious SQL is inserted into a query'],
};

const mockResult = {
  marks_received: 0,
  marks_total: 1,
  key_points_hit: [],
  feedback: 'Not quite.',
};

const freshQuestion = {
  type: 'Application',
  question: 'Describe a prevention technique for SQL injection.',
  answer: ['Use parameterised queries'],
};

const locationState = {
  node: { title: 'SQL Injection', path: 'CS/SQL Injection' },
  treeId: 'tree123',
  sessionId: 'sess456',
};

const noCompleted = { json: () => Promise.resolve({ completed_questions: [] }) };

function renderQuestionScreen() {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/question', state: locationState }]}>
      <Routes>
        <Route path="/question" element={<QuestionScreen />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => vi.restoreAllMocks());

describe('QuestionScreen — new question loading state', () => {
  test('New question button is disabled while a new question is being generated', async () => {
    let resolveNewQuestion;
    const pendingNewQuestion = new Promise(resolve => { resolveNewQuestion = resolve; });

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ questions: [mockQuestion] }) })
      .mockResolvedValueOnce(noCompleted)
      .mockResolvedValueOnce({ json: () => Promise.resolve(mockResult) })
      .mockReturnValueOnce({ json: () => pendingNewQuestion });

    renderQuestionScreen();

    const textarea = await screen.findByPlaceholderText('Type your answer here...');
    fireEvent.change(textarea, { target: { value: 'some answer' } });
    fireEvent.click(screen.getByText('Submit'));

    await screen.findByText('New question');
    fireEvent.click(screen.getByText('New question'));

    expect(screen.getByText('New question').closest('button')).toBeDisabled();

    // Cleanup
    resolveNewQuestion({ question: freshQuestion });
  });

  test('New question button is re-enabled after question is returned', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ questions: [mockQuestion] }) })
      .mockResolvedValueOnce(noCompleted)
      .mockResolvedValueOnce({ json: () => Promise.resolve(mockResult) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ question: freshQuestion }) });

    renderQuestionScreen();

    const textarea = await screen.findByPlaceholderText('Type your answer here...');
    fireEvent.change(textarea, { target: { value: 'some answer' } });
    fireEvent.click(screen.getByText('Submit'));

    await screen.findByText('New question');
    fireEvent.click(screen.getByText('New question'));

    // After the new question loads, the old question is replaced and try-again actions disappear
    await screen.findByText(/Describe a prevention technique/);
    // The Try again / New question buttons should be gone (result cleared)
    expect(screen.queryByText('New question')).not.toBeInTheDocument();
  });
});

