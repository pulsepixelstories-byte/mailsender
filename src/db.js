// ============================================================
// db.js - SQLite database (one file: data/app.db).
// Creates all tables on startup. Progress survives restarts.
// ============================================================
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');

// ONE Gmail account (refresh token encrypted).
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    tokens_encrypted TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Campaigns (wizard Step 3-5 settings stored here).
db.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sheet_id TEXT,
    sheet_name TEXT,
    sheet_tab TEXT,
    email_col TEXT,
    col_map_json TEXT DEFAULT '{}',
    subject TEXT DEFAULT '',
    body_html TEXT DEFAULT '',
    footer TEXT DEFAULT '',
    write_back INTEGER DEFAULT 0,
    mode TEXT DEFAULT 'buffered',
    min_delay_sec INTEGER DEFAULT 30,
    max_delay_sec INTEGER DEFAULT 90,
    batch_size INTEGER DEFAULT 10,
    batch_delay_min_sec INTEGER DEFAULT 10,
    batch_delay_max_sec INTEGER DEFAULT 25,
    batch_pause_min INTEGER DEFAULT 15,
    daily_cap INTEGER DEFAULT 400,
    cap_action TEXT DEFAULT 'pause',
    window_enabled INTEGER DEFAULT 0,
    window_start TEXT DEFAULT '09:00',
    window_end TEXT DEFAULT '18:00',
    window_tz TEXT DEFAULT 'Asia/Dhaka',
    dry_run INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT (datetime('now')),
    started_at TEXT,
    finished_at TEXT
  );
`);

// Recipients = persistent queue. UNIQUE(campaign,email) = never double-send.
db.exec(`
  CREATE TABLE IF NOT EXISTS recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    name TEXT DEFAULT '',
    data_json TEXT DEFAULT '{}',
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    next_try_at TEXT,
    error_message TEXT DEFAULT '',
    gmail_message_id TEXT DEFAULT '',
    sent_at TEXT,
    UNIQUE (campaign_id, email),
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE
  );
`);

// Diary of everything (drives live log + reports).
db.exec(`
  CREATE TABLE IF NOT EXISTS send_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    recipient_id INTEGER,
    event TEXT NOT NULL,
    detail TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE
  );
`);

// Global settings (Settings screen).
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);
const defaults = {
  daily_cap: '400',
  sender_name: 'Business Mail Sender',
  footer: 'Reply STOP to unsubscribe.',
};
for (const [k, v] of Object.entries(defaults)) {
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(k, v);
}

module.exports = db;
