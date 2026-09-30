// Placeholders {{col}} and {{col|default}}, case-insensitive. Pure (tested).
function renderTemplate(text, data = {}) {
  if (!text) return '';
  const lookup = {};
  for (const k of Object.keys(data)) lookup[String(k).toLowerCase()] = data[k];
  return String(text).replace(/{{\s*([a-zA-Z0-9_ ]+?)(?:\|([^}]*))?\s*}}/g, (m, key, def) => {
    const v = lookup[String(key).toLowerCase().trim()];
    if (v === undefined || v === null || String(v) === '') return def !== undefined ? def : '';
    return String(v);
  });
}
function listPlaceholders(text) {
  const out = new Set();
  String(text || '').replace(/{{\s*([a-zA-Z0-9_ ]+?)(?:\|[^}]*)?\s*}}/g, (m, k) => { out.add(k.trim()); return m; });
  return [...out];
}
module.exports = { renderTemplate, listPlaceholders };
