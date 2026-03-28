// src/whatsapp.js — thin wrapper around the WhatsApp Cloud API

const axios = require('axios');

const BASE_URL = 'https://graph.facebook.com/v19.0';

/**
 * Send a plain-text WhatsApp message to a phone number.
 * @param {string} to      - Recipient phone number (e.g. "201234567890")
 * @param {string} text    - Message body
 */
async function sendMessage(to, text) {
  const url = `${BASE_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  };

  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  return response.data;
}

/**
 * Send a reminder message, formatted with emoji and a send count indicator.
 * @param {object} reminder  - Reminder row from DB
 * @param {number} count     - Which send attempt this is (1-indexed)
 */
async function sendReminderMessage(reminder, count) {
  const header = count === 1
    ? '🔔 *Reminder*'
    : `🔔 *Reminder* (attempt ${count})`;

  const label = reminder.label ? `\n_${reminder.label}_` : '';

  const text = [
    header + label,
    '',
    reminder.message,
    '',
    '_Reply with anything (e.g. "ok", "done") to stop this reminder._',
  ].join('\n');

  return sendMessage(process.env.MY_WHATSAPP_NUMBER, text);
}

module.exports = { sendMessage, sendReminderMessage };
