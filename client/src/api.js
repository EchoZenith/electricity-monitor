const BASE = '/api';

export async function checkAuth() {
  const res = await fetch(`${BASE}/check-auth`);
  if (res.status === 401) return false;
  const data = await res.json();
  return data.success;
}

export async function login(username, password) {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return res.json();
}

export async function logout() {
  await fetch(`${BASE}/logout`, { method: 'POST' });
}

export async function fetchCurrent() {
  const res = await fetch(`${BASE}/current`);
  if (res.status === 401) throw new Error('未登录');
  return res.json();
}

export async function fetchHistory() {
  const res = await fetch(`${BASE}/history`);
  if (res.status === 401) throw new Error('未登录');
  return res.json();
}

export async function triggerCollect() {
  const res = await fetch(`${BASE}/trigger-collect`);
  if (res.status === 401) throw new Error('未登录');
  return res.json();
}

export async function fetchRecordsByDate(dateStr) {
  const res = await fetch(`${BASE}/records-by-date?date=${dateStr}`);
  if (res.status === 401) throw new Error('未登录');
  return res.json();
}
