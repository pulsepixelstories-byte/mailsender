// Simple timestamped logger. Never logs tokens.
function info(...a) { console.log(new Date().toISOString(), '[info]', ...a); }
function error(...a) { console.error(new Date().toISOString(), '[error]', ...a); }
function logEvent(campaignId, recipientId, event, detail = '') {
  try {
    require('../db').prepare(
      'INSERT INTO send_log (campaign_id, recipient_id, event, detail) VALUES (?, ?, ?, ?)'
    ).run(campaignId, recipientId, event, String(detail).slice(0, 2000));
  } catch (e) { console.error('[logEvent failed]', e.message); }
}
module.exports = { info, error, logEvent };
