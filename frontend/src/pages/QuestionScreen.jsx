import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import API_BASE from '../api';
import './QuestionScreen.css';

const MAX_CHARS = 1000;
const CHAR_WARNING = 800;

export default function QuestionScreen() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { node, treeId, sessionId, questions: prefetchedQuestions } = state || {};

  const [questions, setQuestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0); // which card's textarea is expanded
  const [userAnswers, setUserAnswers] = useState({});
  const [evaluating, setEvaluating] = useState({});
  const [results, setResults] = useState({});
  const [previouslyCompleted, setPreviouslyCompleted] = useState(new Set());
  const [questionOverrides, setQuestionOverrides] = useState({});

  useEffect(() => {
    if (!node || !treeId) return;
    if (prefetchedQuestions) {
      setQuestions(prefetchedQuestions);
    } else {
      fetchQuestions();
    }
    if (sessionId) fetchCompletedQuestions();
  }, []);

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const encodedPath = node.path.split('/').map(p => encodeURIComponent(p)).join('/');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`${API_BASE}/api/questions/${treeId}/${encodedPath}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('Question fetch timed out after 30 seconds');
      } else {
        console.error('Error fetching questions:', error);
      }
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompletedQuestions = async () => {
    try {
      const encodedPath = encodeURIComponent(node.path);
      const res = await fetch(`${API_BASE}/session/${sessionId}/completed-questions?node_path=${encodedPath}`);
      const data = await res.json();
      setPreviouslyCompleted(new Set(data.completed_questions || []));
    } catch (error) {
      console.error('Error fetching completed questions:', error);
    }
  };

  const handleNewQuestion = async (idx) => {
    try {
      const encodedPath = encodeURIComponent(node.path);
      const currentQuestions = questions.map((q, i) => (questionOverrides[i] || q).question);
      const res = await fetch(`${API_BASE}/api/questions/${treeId}/${encodedPath}/generate-new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ existing_questions: currentQuestions }),
      });
      const data = await res.json();
      if (data.question) {
        setQuestionOverrides(prev => ({ ...prev, [idx]: data.question }));
        setResults(prev => { const next = { ...prev }; delete next[idx]; return next; });
        setUserAnswers(prev => { const next = { ...prev }; delete next[idx]; return next; });
        setActiveIdx(idx);
      }
    } catch (error) {
      console.error('Error fetching new question:', error);
    }
  };

  const handleSubmit = async (question, idx) => {
    const answer = userAnswers[idx] || '';
    if (!answer.trim()) return;

    setEvaluating(prev => ({ ...prev, [idx]: true }));
    try {
      const res = await fetch(`${API_BASE}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tree_id: treeId,
          node_path: node.path,
          question_text: question.question,
          user_answer: answer,
          session_id: sessionId,
        }),
      });
      const data = await res.json();
      setResults(prev => ({ ...prev, [idx]: data }));
    } catch (error) {
      console.error('Error evaluating answer:', error);
    } finally {
      setEvaluating(prev => ({ ...prev, [idx]: false }));
    }
  };

  const handleTryAgain = (idx) => {
    setResults(prev => { const next = { ...prev }; delete next[idx]; return next; });
    setUserAnswers(prev => { const next = { ...prev }; delete next[idx]; return next; });
    setActiveIdx(idx);
  };

  // Derived progress
  const totalQ = questions ? questions.length : 0;
  const answeredCount = Object.keys(results).length;
  const totalEarned = Object.values(results).reduce((s, r) => s + r.marks_received, 0);
  const totalPossible = questions
    ? questions.reduce((s, q, i) => s + (questionOverrides[i] || q).answer.length, 0)
    : 0;
  const allDone = questions && questions.length > 0 && questions.every((_, i) => results[i]);

  const getPipClass = (result, i) => {
    if (!result) return 'pip-unanswered';
    if (i >= result.marks_received) return 'pip-empty';
    const full = result.marks_received === result.marks_total;
    const zero = result.marks_received === 0;
    if (full) return 'pip-filled-green';
    if (zero) return 'pip-filled-red';
    return 'pip-filled-amber';
  };

  const getCardStateClass = (result, isActive) => {
    if (!result) return isActive ? 'q-card-active' : '';
    const full = result.marks_received === result.marks_total;
    const zero = result.marks_received === 0;
    if (full) return 'q-card-success';
    if (zero) return 'q-card-fail';
    return 'q-card-partial';
  };

  const getScoreClass = (result) => {
    const full = result.marks_received === result.marks_total;
    const zero = result.marks_received === 0;
    if (full) return 'q-score-success';
    if (zero) return 'q-score-fail';
    return 'q-score-partial';
  };

  return (
    <div className="qs-page">

      {/* ── Sticky header ── */}
      <header className="qs-header">
        <button className="qs-back-btn" onClick={() => navigate('/')}>
          ← Back to tree
        </button>
        {node && <span className="qs-node-title">{node.title}</span>}
        {questions && (
          <span className="qs-progress">
            <strong>{answeredCount}/{totalQ}</strong> answered
            {' · '}
            <strong>{totalEarned}/{totalPossible}</strong> marks
          </span>
        )}
      </header>

      {/* ── Body ── */}
      <div className="qs-body">
        {loading ? (
          <div className="qs-loading">Loading questions…</div>
        ) : questions && questions.length > 0 ? (
          <>
            {questions.map((baseQ, idx) => {
              const q = questionOverrides[idx] || baseQ;
              const answer = userAnswers[idx] || '';
              const result = results[idx];
              const isEvaluating = evaluating[idx];
              const isActive = activeIdx === idx && !result;
              const cardStateClass = getCardStateClass(result, isActive);

              return (
                <div
                  key={idx}
                  className={`q-card ${cardStateClass} ${!result && !isActive ? 'q-card-clickable' : ''}`}
                  onClick={!result && !isActive ? () => setActiveIdx(idx) : undefined}
                >
                  {/* Card header — always visible */}
                  <div className="q-card-head">
                    <div className="q-num">{idx + 1}</div>
                    <div className="q-head-main">
                      <div className="q-question-text">{q.question}</div>
                      <div className="q-badges">
                        {q.type && <span className="q-type-badge">{q.type}</span>}
                        <span className="q-pips">
                          {Array.from({ length: q.answer.length }, (_, i) => (
                            <span key={i} className={`pip ${getPipClass(result, i)}`} />
                          ))}
                        </span>
                        <span className="q-marks-text">
                          {q.answer.length} mark{q.answer.length !== 1 ? 's' : ''}
                        </span>
                        {previouslyCompleted.has(q.question) && (
                          <span className="q-full-marks-badge">✓ Full marks</span>
                        )}
                      </div>
                    </div>
                    {result && (
                      <span className={`q-score-badge ${getScoreClass(result)}`}>
                        {result.marks_received}/{result.marks_total}
                      </span>
                    )}
                  </div>

                  {/* Answer area — shown when card is active */}
                  {isActive && !isEvaluating && (
                    <div className="q-answer-area">
                      <textarea
                        className="q-textarea"
                        value={answer}
                        onChange={e => setUserAnswers(prev => ({ ...prev, [idx]: e.target.value.slice(0, MAX_CHARS) }))}
                        onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                        placeholder="Type your answer here..."
                        disabled={isEvaluating}
                      />
                      <div className="q-answer-footer">
                        {answer.length >= CHAR_WARNING && (
                          <span className={`q-char-count ${answer.length >= MAX_CHARS ? 'at-limit' : 'near-limit'}`}>
                            {answer.length} / {MAX_CHARS}
                          </span>
                        )}
                        <button
                          className="q-submit-btn"
                          onClick={e => { e.stopPropagation(); handleSubmit(q, idx); }}
                          disabled={!answer.trim()}
                        >
                          Submit
                        </button>
                      </div>
                    </div>
                  )}

                  {isEvaluating && (
                    <div className="q-answer-area">
                      <div className="q-evaluating">Evaluating…</div>
                    </div>
                  )}

                  {/* Result area */}
                  {result && (
                    <div className="q-result-area">
                      <ul className="q-key-points">
                        {q.answer.map((point, i) => {
                          const hit = result.key_points_hit.includes(point);
                          return (
                            <li key={i} className={`q-key-point ${hit ? 'q-point-hit' : 'q-point-miss'}`}>
                              <span className="q-point-icon">{hit ? '✓' : '✗'}</span>
                              <span className="q-point-text">{point}</span>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="q-your-answer">Your answer: {userAnswers[idx]}</p>
                      <p className="q-feedback">{result.feedback}</p>
                      <div className="q-result-actions">
                        <button className="q-ghost-btn" onClick={() => handleTryAgain(idx)}>
                          Try again
                        </button>
                        <button className="q-ghost-btn" onClick={() => handleNewQuestion(idx)}>
                          New question
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {allDone && (
              <div className="qs-done-banner">
                <div className="qs-done-score">{totalEarned}/{totalPossible}</div>
                <p className="qs-done-label">marks earned on this topic</p>
                <button className="qs-done-back" onClick={() => navigate('/')}>
                  ← Back to tree
                </button>
              </div>
            )}
          </>
        ) : (
          <p style={{ color: 'var(--h-text-2)', padding: '48px 0', textAlign: 'center' }}>
            No questions available for this node.
          </p>
        )}
      </div>
    </div>
  );
}
