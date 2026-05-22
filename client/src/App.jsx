import { useState, useEffect } from 'react';
import { Spin } from 'antd';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import { checkAuth } from './api';

export default function App() {
  const [authed, setAuthed] = useState(null);

  useEffect(() => {
    checkAuth().then(setAuthed).catch(() => setAuthed(false));
  }, []);

  if (authed === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return authed ? <Dashboard onLogout={() => setAuthed(false)} /> : <Login onLogin={() => setAuthed(true)} />;
}
