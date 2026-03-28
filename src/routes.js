// src/routes.js — Express routes: WhatsApp webhook + reminder management API

const express = require('express');
const router  = express.Router();
const db      = require('./db');
const { sendMessage } = require('./whatsapp');
const { isAffirmative } = require('./replies');

// ─── WhatsApp Webhook Verification ───────────────────────────────────────────

router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[webhook] Verified by Meta');
    res.status(200).send(challenge);
  } else {
    console.warn('[webhook] Verification failed — check WHATSAPP_VERIFY_TOKEN');
    res.sendStatus(403);
  }
});

// ─── Incoming Messages ────────────────────────────────────────────────────────

router.post('/webhook', async (req, res) => {
  // Always respond 200 fast — Meta will retry if you don't
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const entry   = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    // Ignore status updates (delivered, read receipts)
    if (!value?.messages) return;

    const msg    = value.messages[0];
    const from   = msg.from; // sender's phone number
    const myNum  = process.env.MY_WHATSAPP_NUMBER;

    // Only process messages from yourself
    if (from !== myNum) {
      console.log(`[webhook] Ignoring message from unknown number: ${from}`);
      return;
    }

    const text = msg.text?.body || '';
    console.log(`[webhook] Incoming from self: "${text}"`);

    // Check for command syntax: "ADD <time> | <message>"
    const addMatch = text.match(/^ADD\s+(.+?)\s*\|\s*(.+)$/i);
    if (addMatch) {
      await handleAddCommand(addMatch[1].trim(), addMatch[2].trim());
      return;
    }

    // Check for LIST command
    if (/^LIST$/i.test(text.trim())) {
      await handleListCommand();
      return;
    }

    // Check for DELETE command: "DEL <id>"
    const delMatch = text.match(/^DEL\s+(\d+)$/i);
    if (delMatch) {
      await handleDeleteCommand(parseInt(delMatch[1], 10));
      return;
    }

    // Otherwise treat as an acknowledgement of the oldest pending reminder
    if (isAffirmative(text)) {
      const pending = db.getOldestPendingReminder();
      if (pending) {
        db.markAcknowledged(pending.id);
        const label = pending.label ? `"${pending.label}"` : `#${pending.id}`;
        await sendMessage(myNum, `✅ Reminder ${label} acknowledged and stopped.`);
        console.log(`[webhook] Acknowledged reminder #${pending.id}`);
      } else {
        await sendMessage(myNum, `✅ No active reminders to acknowledge.`);
      }
    }
  } catch (err) {
    console.error('[webhook] Error processing message:', err.message);
  }
});

// ─── Command Handlers ─────────────────────────────────────────────────────────

/**
 * ADD command: "ADD tomorrow 9am | Take your meds"
 *              "ADD 2024-12-25 08:00 | Christmas reminder"
 *              "ADD in 30 minutes | Call mum"
 */
async function handleAddCommand(timeStr, message) {
  const myNum = process.env.MY_WHATSAPP_NUMBER;

  try {
    const fireAt = parseTime(timeStr);
    if (!fireAt || isNaN(fireAt.getTime())) {
      await sendMessage(myNum,
        `❌ Couldn't parse time: "${timeStr}"\n\nExamples:\n• ADD tomorrow 9am | Take meds\n• ADD 2024-12-25 08:00 | Meeting\n• ADD in 30 minutes | Call mum`
      );
      return;
    }

    const id = db.addReminder({ message, fireAt, label: timeStr });
    const when = fireAt.toLocaleString('en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' });
    await sendMessage(myNum, `✅ Reminder #${id} set for *${when}*\n\n"${message}"`);
    console.log(`[command] Added reminder #${id}: "${message}" at ${fireAt.toISOString()}`);
  } catch (err) {
    await sendMessage(myNum, `❌ Error adding reminder: ${err.message}`);
  }
}

async function handleListCommand() {
  const myNum  = process.env.MY_WHATSAPP_NUMBER;
  const all    = db.getAllReminders();
  const active = all.filter(r => r.status === 'pending');

  if (active.length === 0) {
    await sendMessage(myNum, '📋 No active reminders.');
    return;
  }

  const lines = active.map(r => {
    const when = new Date(r.fire_at).toLocaleString('en-GB', {
      timeZone: 'Africa/Cairo', dateStyle: 'short', timeStyle: 'short',
    });
    return `• #${r.id} [${when}] — ${r.message.slice(0, 50)}${r.message.length > 50 ? '…' : ''}`;
  });

  await sendMessage(myNum, `📋 *Active reminders (${active.length}):*\n\n${lines.join('\n')}\n\n_Reply "DEL <id>" to delete one._`);
}

async function handleDeleteCommand(id) {
  const myNum    = process.env.MY_WHATSAPP_NUMBER;
  const reminder = db.getReminderById(id);

  if (!reminder) {
    await sendMessage(myNum, `❌ No reminder found with id #${id}`);
    return;
  }

  db.deleteReminder(id);
  await sendMessage(myNum, `🗑️ Reminder #${id} deleted.`);
  console.log(`[command] Deleted reminder #${id}`);
}

// ─── Simple Time Parser ───────────────────────────────────────────────────────

/**
 * Parse human-friendly time strings into a Date object.
 * Handles:
 *   "in 30 minutes", "in 2 hours", "in 1 day"
 *   "tomorrow 9am", "tomorrow 14:30"
 *   "YYYY-MM-DD HH:mm"
 *   "HH:mm" (today, or tomorrow if time has passed)
 */
function parseTime(str) {
  const s = str.trim().toLowerCase();

  // "in X minutes/hours/days"
  const relMatch = s.match(/^in\s+(\d+)\s+(minute|hour|day)s?$/i);
  if (relMatch) {
    const amount = parseInt(relMatch[1], 10);
    const unit   = relMatch[2].toLowerCase();
    const ms     = unit === 'minute' ? amount * 60_000
                 : unit === 'hour'   ? amount * 3_600_000
                 :                     amount * 86_400_000;
    return new Date(Date.now() + ms);
  }

  // "tomorrow HH:mm" or "tomorrow Xam/pm"
  const tomorrowMatch = s.match(/^tomorrow\s+(.+)$/i);
  if (tomorrowMatch) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const timeStr  = tomorrowMatch[1].trim();
    return setTimeOnDate(tomorrow, timeStr);
  }

  // "YYYY-MM-DD HH:mm"
  const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})$/);
  if (isoMatch) {
    return new Date(`${isoMatch[1]}T${padTime(isoMatch[2])}:00`);
  }

  // "HH:mm" or "Xam/pm" — today, or tomorrow if already past
  const timeOnly = setTimeOnDate(new Date(), s);
  if (timeOnly && timeOnly > new Date()) return timeOnly;
  if (timeOnly) {
    // Time has passed today — schedule for tomorrow
    timeOnly.setDate(timeOnly.getDate() + 1);
    return timeOnly;
  }

  return null;
}

function setTimeOnDate(date, timeStr) {
  // Handles "9am", "9:30am", "14:30", "2pm"
  const ampm = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = parseInt(ampm[2] || '0', 10);
    const period = ampm[3].toLowerCase();
    if (period === 'pm' && h !== 12) h += 12;
    if (period === 'am' && h === 12) h = 0;
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return d;
  }
  const hhmm = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const d = new Date(date);
    d.setHours(parseInt(hhmm[1], 10), parseInt(hhmm[2], 10), 0, 0);
    return d;
  }
  return null;
}

function padTime(t) {
  const [h, m] = t.split(':');
  return `${h.padStart(2, '0')}:${m}`;
}

// ─── REST API (optional, for programmatic use) ────────────────────────────────

// POST /api/reminders  { message, fireAt (ISO string), label? }
router.post('/api/reminders', (req, res) => {
  const { message, fireAt, label } = req.body;
  if (!message || !fireAt) {
    return res.status(400).json({ error: 'message and fireAt are required' });
  }
  const id = db.addReminder({ message, fireAt: new Date(fireAt), label });
  res.status(201).json({ id });
});

// GET /api/reminders
router.get('/api/reminders', (req, res) => {
  res.json(db.getAllReminders());
});

// DELETE /api/reminders/:id
router.delete('/api/reminders/:id', (req, res) => {
  db.deleteReminder(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

module.exports = router;
