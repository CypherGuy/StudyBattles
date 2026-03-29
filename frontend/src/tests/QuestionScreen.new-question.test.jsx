import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import QuestionScreen from '../pages/QuestionScreen';

const mockQuestion = {
  type: 'Definition',
  question: 'What is SQL injection?',
  answer: ['A technique where malicious SQL is inserted into a query'],
};

const freshQuestion = {
  type: 'Application',
  question: 'Give two consequences of a successful SQL injection attack.',
  answer: ['Attacker can bypass authentication', 'Attacker can exfiltrate database contents'],
};

const mockResult = {
  marks_received: 0,
  marks_total: 1,
  key_points_hit: [],
  feedback: 'Not quite — try again.',
};

const locationState = {
  node: { title: 'SQL Injection', path: 'CS/SQL Injection' },
  treeId: '507f1f77bcf86cd799439011',
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

describe('QuestionScreen — New question option', () => {
  test('shows a New question button alongside Try again after a result', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ questions: [mockQuestion] }) })
      .mockResolvedValueOnce(noCompleted)
      .mockResolvedValueOnce({ json: () => Promise.resolve(mockResult) });

    renderQuestionScreen();

    const textarea = await screen.findByPlaceholderText('Type your answer here...');
    fireEvent.change(textarea, { target: { value: 'some answer' } });
    fireEvent.click(screen.getByText('Submit'));

    expect(await screen.findByText('New question')).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  test('clicking New question replaces the current question with the fetched one', async () => {
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

    expect(await screen.findByText(/Give two consequences/)).toBeInTheDocument();
    expect(screen.queryByText(/What is SQL injection/)).not.toBeInTheDocument();
  });
});
