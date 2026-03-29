import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import QuestionScreen from '../pages/QuestionScreen';

const mockQuestion = {
  type: 'Definition',
  question: 'What is a foreign key?',
  answer: ['A field that links to the primary key of another table'],
};

const noCompletedQuestions = { json: () => Promise.resolve({ completed_questions: [] }) };

function renderWithPrefetch(questions) {
  const state = {
    node: { title: 'Databases', path: 'CS/Databases' },
    treeId: 'tree789',
    sessionId: 'sess123',
    questions,
  };
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/question', state }]}>
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

describe('QuestionScreen — prefetched questions', () => {
  test('displays prefetched questions without calling the questions endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue(noCompletedQuestions);

    renderWithPrefetch([mockQuestion]);

    expect(await screen.findByText(/What is a foreign key\?/)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/questions/')
    );
  });

  test('still fetches completed questions from backend even when questions are prefetched', async () => {
    global.fetch = vi.fn().mockResolvedValue(noCompletedQuestions);

    renderWithPrefetch([mockQuestion]);

    await screen.findByText(/What is a foreign key\?/);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/session/sess123/completed-questions')
    );
  });
});
