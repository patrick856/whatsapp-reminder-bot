// src/index.js — Entry point: starts Express server and scheduler

require('dotenv').config();

const express = require('express');
const routes  = require('./routes');
const { startScheduler } = require('./scheduler');

// ─── Validate required env vars ───────────────────────────────────────────────

const REQUIRED = [
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'MY_WHATSAPP_NUMBER',
];

const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error('❌ Missing required environment variables:', missing.join(', '));
  console.error('   Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

// ─── Express setup ────────────────────────────────────────────────────────────

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/', routes);

// Health-check endpoint (Railway/Render ping this)
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.listen(PORT, () => {
  console.log(`\n🤖 WhatsApp Reminder Bot running on port ${PORT}`);
  console.log(`   Webhook endpoint: POST /webhook`);
  console.log(`   Retry interval:   ${process.env.RETRY_INTERVAL_MINUTES || 10} minutes`);
  console.log(`   Sending to:       +${process.env.MY_WHATSAPP_NUMBER}\n`);
});

// ─── Start scheduler ─────────────────────────────────────────────────────────

startScheduler();

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  process.exit(0);
});
