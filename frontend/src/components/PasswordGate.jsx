import { useState } from 'react';
import API_BASE from '../api';

export default function PasswordGate({ onSuccess }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: input }),
      });
      if (res.ok) {
        const { token } = await res.json();
        sessionStorage.setItem('authenticated', '1');
        sessionStorage.setItem('auth_token', token);
        onSuccess();
      } else {
        setError('Incorrect password.');
        setInput('');
      }
    } catch {
      setError('Could not reach server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#0f0f0f',
    }}>
      <h2 style={{ color: '#fff', marginBottom: '1.5rem', fontSize: '1.4rem' }}>
        Enter password to continue
      </h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '260px' }}>
        <input
          type="password"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Password"
          autoFocus
          style={{
            padding: '0.6rem 0.8rem',
            borderRadius: '6px',
            border: '1px solid #333',
            background: '#1a1a1a',
            color: '#fff',
            fontSize: '1rem',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.6rem',
            borderRadius: '6px',
            border: 'none',
            background: '#4a90e2',
            color: '#fff',
            fontSize: '1rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Checking...' : 'Enter'}
        </button>
        {error && <p style={{ color: '#e25c5c', margin: 0, fontSize: '0.9rem' }}>{error}</p>}
      </form>
    </div>
  );
}
