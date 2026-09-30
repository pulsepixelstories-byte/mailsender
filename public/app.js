// Shared browser helpers: api() + escapeHtml(). Works on :3001 and /mail-sender/.
async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  let data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON */ }
  if (!res.ok) throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
  return data;
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Auth gate for protected pages: not signed in -> back to login page.
// Call guard() first thing in dashboard/wizard/live/reports/settings.
async function guard() {
  try {
    const s = await api('/auth/status');
    if (!s.loggedIn) location.href = './';
  } catch (e) { location.href = './'; }
}
