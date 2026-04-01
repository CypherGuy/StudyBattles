import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import QuestionScreen from './pages/QuestionScreen';
import PasswordGate from './components/PasswordGate';

export default function App() {
  const [authenticated, setAuthenticated] = useState(
    sessionStorage.getItem('authenticated') === '1'
  );

  if (!authenticated) {
    return <PasswordGate onSuccess={() => setAuthenticated(true)} />;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/question" element={<QuestionScreen />} />
      </Routes>
    </Router>
  );
}