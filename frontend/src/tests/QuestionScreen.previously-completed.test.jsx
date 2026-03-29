import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('QuestionScreen — previously completed questions', () => {
  test('shows a full marks badge on a question the user already completed in a prior visit', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ questions: [mockQuestion] }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ completed_questions: ['What is SQL injection?'] }) });

    renderQuestionScreen();

    expect(await screen.findByText('✓ Full marks')).toBeInTheDocument();
  });

  test('does not show full marks badge when no questions were previously completed', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ questions: [mockQuestion] }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ completed_questions: [] }) });

    renderQuestionScreen();

    await screen.findByPlaceholderText('Type your answer here...');
    expect(screen.queryByText('✓ Full marks')).not.toBeInTheDocument();
  });
});
