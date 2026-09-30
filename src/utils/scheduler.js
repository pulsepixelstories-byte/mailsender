// Scheduler math: pure functions (tested). No DB, no network here.
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}
// Seconds until next send in buffered mode.
function bufferedDelay(minS, maxS) {
  return randomBetween(Math.max(1, minS), Math.max(minS, maxS));
}
// Seconds inside a batch (short delay).
function batchInnerDelay(minS, maxS) {
  return randomBetween(Math.max(1, minS), Math.max(minS, maxS));
}
// Estimated total seconds for N emails (uses averages).
function estimateTotalSec(n, cfg) {
  if (cfg.mode === 'batch') {
    const per = (cfg.batch_delay_min_sec + cfg.batch_delay_max_sec) / 2;
    const batches = Math.ceil(n / cfg.batch_size);
    return Math.round(n * per + Math.max(0, batches - 1) * cfg.batch_pause_min * 60);
  }
  return Math.round(n * ((cfg.min_delay_sec + cfg.max_delay_sec) / 2));
}
// True if "now" is inside the sending window (HH:MM, given timezone).
function inWindow(now, start, end, tz) {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
    const cur = fmt.format(now);
    if (start <= end) return cur >= start && cur <= end;
    return cur >= start || cur <= end; // overnight window
  } catch (e) { return true; }
}
// Exponential backoff seconds for retry attempt (1..3): 30, 120, 480.
function backoffSec(attempt) {
  return [30, 120, 480][Math.min(attempt, 3) - 1] || 480;
}
module.exports = { randomBetween, bufferedDelay, batchInnerDelay, estimateTotalSec, inWindow, backoffSec };
