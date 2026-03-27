import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function QuestionScreen() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { node, treeId, sessionId } = state || {};

  const [questions, setQuestions] = useState(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div style={{ padding: '20px' }}>
      <button onClick={() => navigate(-1)} style={{ marginBottom: '20px', padding: '6px 14px' }}>
        ← Back to tree
      </button>

      <h2>{node?.title}</h2>

      {loading ? (
        <p>Loading questions...</p>
      ) : questions && questions.length > 0 ? (
        <div>
          {questions.map((q, idx) => (
            <div key={idx} style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px', border: '1px solid #eee' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>Q{idx + 1}: {q.question}</h3>
              <div style={{ marginLeft: '20px' }}>
                <strong>Answer points:</strong>
                <ul style={{ marginTop: '8px' }}>
                  {q.answer && q.answer.map((ans, i) => (
                    <li key={i} style={{ marginBottom: '6px' }}>{ans}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p>No questions available for this node.</p>
      )}
    </div>
  );
}
