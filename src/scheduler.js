// src/scheduler.js — cron job that fires due reminders and handles retries

const cron = require('node-cron');
const db = require('./db');
const { sendReminderMessage } = require('./whatsapp');

const RETRY_MINUTES = parseInt(process.env.RETRY_INTERVAL_MINUTES || '10', 10);
const MAX_RETRIES   = parseInt(process.env.MAX_RETRIES || '0', 10); // 0 = unlimited

/**
 * Called every minute by the cron job.
 * Fetches all due pending reminders and sends/retries them.
 */
async function processDueReminders() {
  const due = db.getDueReminders();
  if (due.length === 0) return;

  console.log(`[scheduler] ${due.length} reminder(s) due`);

  for (const reminder of due) {
    // Check max retry cap
    if (MAX_RETRIES > 0 && reminder.send_count >= MAX_RETRIES) {
      console.log(`[scheduler] Reminder #${reminder.id} hit max retries — expiring`);
      db.markExpired(reminder.id);
      continue;
    }

    try {
      await sendReminderMessage(reminder, reminder.send_count + 1);
      db.markSent(reminder.id, RETRY_MINUTES);
      console.log(`[scheduler] Sent reminder #${reminder.id} (attempt ${reminder.send_count + 1}): "${reminder.message.slice(0, 40)}"`);
    } catch (err) {
      console.error(`[scheduler] Failed to send reminder #${reminder.id}:`, err.message);
    }
  }
}

/**
 * Start the cron scheduler. Runs every minute.
 */
function startScheduler() {
  console.log(`[scheduler] Starting — checking every minute, retry every ${RETRY_MINUTES}min`);

  // Run immediately on startup to catch any reminders that fired while offline
  processDueReminders();

  // Then run every minute
  cron.schedule('* * * * *', processDueReminders);
}

module.exports = { startScheduler };
