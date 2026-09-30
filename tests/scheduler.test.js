// Tests: scheduler math (delays, ETA, window, backoff).
const { test } = require('node:test');
const assert = require('node:assert');
const s = require('../src/utils/scheduler');

test('buffered delay stays in range', () => {
  for (let i = 0; i < 20; i++) {
    const d = s.bufferedDelay(30, 90);
    assert.ok(d >= 30 && d <= 90, 'out of range: ' + d);
  }
});
test('batch ETA includes rest periods', () => {
  const secs = s.estimateTotalSec(25, { mode: 'batch', batch_delay_min_sec: 10, batch_delay_max_sec: 20, batch_size: 10, batch_pause_min: 15 });
  // 25 mails ~375s sending + 2 rests of 900s = ~2175s
  assert.ok(secs > 2000 && secs < 2400, 'eta=' + secs);
});
test('buffered ETA is average-based', () => {
  assert.strictEqual(s.estimateTotalSec(10, { mode: 'buffered', min_delay_sec: 30, max_delay_sec: 90 }), 600);
});
test('sending window respects time', () => {
  const noon = new Date('2026-01-01T12:00:00+06:00');
  assert.ok(s.inWindow(noon, '09:00', '18:00', 'Asia/Dhaka'));
  assert.ok(!s.inWindow(noon, '13:00', '18:00', 'Asia/Dhaka'));
});
test('backoff grows: 30,120,480', () => {
  assert.deepStrictEqual([s.backoffSec(1), s.backoffSec(2), s.backoffSec(3)], [30, 120, 480]);
});
