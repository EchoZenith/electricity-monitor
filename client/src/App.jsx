import { useState, useEffect } from 'react';
import { Spin } from 'antd';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import { checkAuth } from './api';

const cssVars = `
[data-theme="light"], [data-theme="dark"] {
  --bg-body: #f5f7fa;
  --bg-card: #ffffff;
  --bg-chart: #fafbfc;
  --bg-item: #f8f9fa;
  --bg-item-blue: #e8f4fd;
  --bg-item-purple: #f0e8fd;
  --bg-item-green: #e8fdf4;
  --text-primary: #1a1a1a;
  --text-secondary: #666;
  --text-tertiary: #999;
  --border-light: #e8e8e8;
  --tab-bg: #f0f2f5;
  --tab-bg-active: #333;
  --tab-text: #666;
  --tab-text-active: white;
}

[data-theme="dark"] {
  --bg-body: #141414;
  --bg-card: #1f1f1f;
  --bg-chart: #2a2a2a;
  --bg-item: #2a2a2a;
  --bg-item-blue: rgba(74, 144, 226, 0.15);
  --bg-item-purple: rgba(155, 89, 182, 0.15);
  --bg-item-green: rgba(39, 174, 96, 0.15);
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0a0;
  --text-tertiary: #808080;
  --border-light: #333;
  --tab-bg: #2a2a2a;
  --tab-bg-active: #4a90e2;
  --tab-text: #808080;
  --tab-text-active: white;
}

body { margin: 0; background: var(--bg-body); }
`;

export default function App() {
  const [authed, setAuthed] = useState(null);

  useEffect(() => {
    checkAuth().then(setAuthed).catch(() => setAuthed(false));
  }, []);

  if (authed === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-body)' }}>
        <style>{cssVars}</style>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <>
      <style>{cssVars}</style>
      {authed ? <Dashboard onLogout={() => setAuthed(false)} /> : <Login onLogin={() => setAuthed(true)} />}
    </>
  );
}
