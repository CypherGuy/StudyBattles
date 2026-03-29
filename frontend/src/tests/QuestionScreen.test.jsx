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
  marks_received: 1,
  marks_total: 1,
  key_points_hit: ['A technique where malicious SQL is inserted into a query'],
  feedback: 'Good answer.',
};

const locationState = {
  node: { title: 'SQL Injection', path: 'CS/SQL Injection' },
  treeId: 'tree123',
  sessionId: 'sess456',
};

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

beforeEach(() => {
  vi.restoreAllMocks();
});

const noCompletedQuestions = { json: () => Promise.resolve({ completed_questions: [] }) };

describe('QuestionScreen — Try again', () => {
  test('shows Try again button after a result is returned', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ questions: [mockQuestion] }) })
      .mockResolvedValueOnce(noCompletedQuestions)
      .mockResolvedValueOnce({ json: () => Promise.resolve(mockResult) });

    renderQuestionScreen();

    const textarea = await screen.findByPlaceholderText('Type your answer here...');
    fireEvent.change(textarea, { target: { value: 'SQL injection is when bad SQL is injected' } });
    fireEvent.click(screen.getByText('Submit'));

    expect(await screen.findByText('Try again')).toBeInTheDocument();
  });

  test('clicking Try again clears the result and shows the textarea again', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ questions: [mockQuestion] }) })
      .mockResolvedValueOnce(noCompletedQuestions)
      .mockResolvedValueOnce({ json: () => Promise.resolve(mockResult) });

    renderQuestionScreen();

    const textarea = await screen.findByPlaceholderText('Type your answer here...');
    fireEvent.change(textarea, { target: { value: 'some answer' } });
    fireEvent.click(screen.getByText('Submit'));

    await screen.findByText('Try again');
    fireEvent.click(screen.getByText('Try again'));

    expect(await screen.findByPlaceholderText('Type your answer here...')).toBeInTheDocument();
    expect(screen.queryByText('Try again')).not.toBeInTheDocument();
  });
});

describe('QuestionScreen — Back to tree at bottom', () => {
  test('shows a Back to tree button at the bottom once all questions are answered', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ questions: [mockQuestion] }) })
      .mockResolvedValueOnce(noCompletedQuestions)
      .mockResolvedValueOnce({ json: () => Promise.resolve(mockResult) });

    renderQuestionScreen();

    const textarea = await screen.findByPlaceholderText('Type your answer here...');
    fireEvent.change(textarea, { target: { value: 'some answer' } });
    fireEvent.click(screen.getByText('Submit'));

    await screen.findByText('Try again');

    const backButtons = await screen.findAllByText('← Back to tree');
    expect(backButtons.length).toBeGreaterThanOrEqual(2);
  });
});
