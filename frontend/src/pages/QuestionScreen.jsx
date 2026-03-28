import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const MAX_CHARS = 1000;

export default function QuestionScreen() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { node, treeId, sessionId } = state || {};

  const [questions, setQuestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [userAnswers, setUserAnswers] = useState({});   // { questionIdx: answerText }
  const [evaluating, setEvaluating] = useState({});     // { questionIdx: bool }
  const [results, setResults] = useState({});           // { questionIdx: { marks_received, marks_total, key_points_hit } }

  useEffect(() => {
    if (!node || !treeId) return;
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const encodedPath = node.path.split('/').map(p => encodeURIComponent(p)).join('/');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout for question generation

      const res = await fetch(`http://localhost:8000/api/questions/${treeId}/${encodedPath}`, {
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

  const handleSubmit = async (question, idx) => {
    const answer = userAnswers[idx] || '';
    if (!answer.trim()) return;

    setEvaluating(prev => ({ ...prev, [idx]: true }));
    try {
      const res = await fetch('http://localhost:8000/evaluate', {
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

  return (
    <div style={{ padding: '20px' }}>
      <button onClick={() => navigate('/')} style={{ marginBottom: '20px', padding: '6px 14px' }}>
        ← Back to tree
      </button>

      <h2>{node?.title}</h2>

      {loading ? (
        <p>Loading questions...</p>
      ) : questions && questions.length > 0 ? (
        <div>
          {questions.map((q, idx) => {
            const answer = userAnswers[idx] || '';
            const result = results[idx];
            const isEvaluating = evaluating[idx];

            return (
              <div key={idx} style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px', border: '1px solid #eee' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>Q{idx + 1}: {q.question}</h3>

                {!result && (
                  <div style={{ marginTop: '10px' }}>
                    <textarea
                      value={answer}
                      onChange={e => setUserAnswers(prev => ({ ...prev, [idx]: e.target.value.slice(0, MAX_CHARS) }))}
                      placeholder="Type your answer here..."
                      disabled={isEvaluating}
                      style={{ width: '100%', minHeight: '80px', padding: '8px', boxSizing: 'border-box', resize: 'vertical' }}
                    />
                    <div style={{ fontSize: '12px', color: answer.length >= MAX_CHARS ? 'red' : '#888', textAlign: 'right' }}>
                      {answer.length} / {MAX_CHARS}
                    </div>
                    <button
                      onClick={() => handleSubmit(q, idx)}
                      disabled={isEvaluating || !answer.trim()}
                      style={{ marginTop: '8px', padding: '6px 16px' }}
                    >
                      {isEvaluating ? 'Evaluating...' : 'Submit'}
                    </button>
                  </div>
                )}

                {/* Phase 9 will add results display here */}
                {result && (
                  <p style={{ marginTop: '10px', color: 'green' }}>
                    Submitted — {result.marks_received}/{result.marks_total} marks
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p>No questions available for this node.</p>
      )}
    </div>
  );
}
