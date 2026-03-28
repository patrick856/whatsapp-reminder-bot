// src/db.js — SQLite database setup and all reminder CRUD operations

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'reminders.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS reminders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    message     TEXT    NOT NULL,
    -- When to first fire (ISO 8601 string, stored in UTC)
    fire_at     TEXT    NOT NULL,
    -- 'pending' | 'acknowledged' | 'expired'
    status      TEXT    NOT NULL DEFAULT 'pending',
    -- How many times we've already sent this reminder
    send_count  INTEGER NOT NULL DEFAULT 0,
    -- Timestamp of the last send attempt
    last_sent_at TEXT,
    -- When the user replied and acknowledged
    acked_at    TEXT,
    -- Label for display (optional)
    label       TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Add a new reminder.
 * @param {object} opts
 * @param {string} opts.message  - The reminder text to send
 * @param {Date}   opts.fireAt   - When to first send it
 * @param {string} [opts.label]  - Optional short label
 * @returns {number} The new reminder's id
 */
function addReminder({ message, fireAt, label = null }) {
  const stmt = db.prepare(`
    INSERT INTO reminders (message, fire_at, label)
    VALUES (@message, @fireAt, @label)
  `);
  const result = stmt.run({ message, fireAt: fireAt.toISOString(), label });
  return result.lastInsertRowid;
}

/**
 * Get all reminders that are pending and whose fire_at time has passed,
 * OR that were already sent but not yet acknowledged.
 */
function getDueReminders() {
  return db.prepare(`
    SELECT * FROM reminders
    WHERE status = 'pending'
      AND datetime(fire_at) <= datetime('now')
  `).all();
}

/**
 * Get all reminders (for listing / admin use).
 */
function getAllReminders() {
  return db.prepare(`SELECT * FROM reminders ORDER BY fire_at DESC`).all();
}

/**
 * Get a single reminder by id.
 */
function getReminderById(id) {
  return db.prepare(`SELECT * FROM reminders WHERE id = ?`).get(id);
}

/**
 * Mark that we just sent a reminder — update send_count and last_sent_at,
 * and push fire_at forward by RETRY_INTERVAL_MINUTES so the scheduler
 * won't fire it again until then.
 */
function markSent(id, retryMinutes) {
  db.prepare(`
    UPDATE reminders
    SET send_count  = send_count + 1,
        last_sent_at = datetime('now'),
        fire_at      = datetime('now', '+' || ? || ' minutes')
    WHERE id = ?
  `).run(retryMinutes, id);
}

/**
 * Mark a reminder as acknowledged (user replied).
 */
function markAcknowledged(id) {
  db.prepare(`
    UPDATE reminders
    SET status   = 'acknowledged',
        acked_at = datetime('now')
    WHERE id = ?
  `).run(id);
}

/**
 * Mark a reminder as expired (hit max retries).
 */
function markExpired(id) {
  db.prepare(`
    UPDATE reminders
    SET status = 'expired'
    WHERE id = ?
  `).run(id);
}

/**
 * Delete a reminder by id.
 */
function deleteReminder(id) {
  db.prepare(`DELETE FROM reminders WHERE id = ?`).run(id);
}

/**
 * Find the oldest pending reminder that the user might be replying to.
 * Used when an incoming message arrives — we acknowledge the earliest one.
 */
function getOldestPendingReminder() {
  return db.prepare(`
    SELECT * FROM reminders
    WHERE status = 'pending' AND send_count > 0
    ORDER BY fire_at ASC
    LIMIT 1
  `).get();
}

module.exports = {
  addReminder,
  getDueReminders,
  getAllReminders,
  getReminderById,
  markSent,
  markAcknowledged,
  markExpired,
  deleteReminder,
  getOldestPendingReminder,
};
