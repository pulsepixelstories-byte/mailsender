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
// Log out from any page's nav bar, then go to the login page.
async function logoutNav() {
  try { await api('/auth/logout', { method: 'POST' }); } catch (e) { /* still leave */ }
  location.href = './';
}
// Call guard() first thing in dashboard/wizard/live/reports/settings/users.
// Also reveals the admin-only Users link in the nav bar.
async function guard() {
  try {
    const s = await api('/auth/status');
    if (!s.loggedIn) { location.href = './'; return; }
    if (s.role === 'admin') {
      const link = document.getElementById('usersNav');
      if (link) link.classList.remove('hidden');
    }
  } catch (e) { location.href = './'; }
}
