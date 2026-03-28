# WhatsApp Reminder Bot

A personal WhatsApp bot that sends you reminders at scheduled times and keeps retrying until you reply with anything affirmative.

## How it works

1. You send yourself a message like `ADD tomorrow 9am | Take medication`
2. At 9am, the bot sends you a WhatsApp reminder
3. If you don't reply, it resends every 10 minutes (configurable)
4. Once you reply with "ok", "done", "👍", etc. — it stops

---

## Setup Guide

### Step 1 — Create a Meta Developer App

1. Go to [developers.facebook.com](https://developers.facebook.com) and create an account
2. Click **My Apps → Create App → Business**
3. Add the **WhatsApp** product to your app
4. Go to **WhatsApp → API Setup**
5. Note your:
   - **Phone Number ID** (`WHATSAPP_PHONE_NUMBER_ID`)
   - **Temporary access token** (create a permanent one below)

### Step 2 — Get a permanent access token

The temporary token expires in 24h. For a permanent one:

1. Go to [business.facebook.com](https://business.facebook.com) → **Settings → System Users**
2. Create a System User → assign it **Admin** role on your app
3. Generate a token with `whatsapp_business_messaging` permission
4. Copy it → `WHATSAPP_TOKEN`

### Step 3 — Use your own number (optional)

The free Meta sandbox gives you a test number, but you can only send to 5 verified numbers.  
To use your actual WhatsApp number:

1. In your Meta app → **WhatsApp → Phone Numbers → Add phone number**
2. Follow the verification steps
3. Update `MY_WHATSAPP_NUMBER` to your number in international format (no `+`)

### Step 4 — Deploy to Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your repo
4. Set **Start command**: `npm start`
5. Set **Environment variables** (copy from `.env.example`):
   ```
   WHATSAPP_TOKEN=...
   WHATSAPP_PHONE_NUMBER_ID=...
   WHATSAPP_VERIFY_TOKEN=pick_any_secret_string
   MY_WHATSAPP_NUMBER=201234567890
   RETRY_INTERVAL_MINUTES=10
   ```
6. Deploy — note your app URL (e.g. `https://your-bot.onrender.com`)

> **Important for Render free tier:** Enable **"Keep alive"** or use a service like [uptimerobot.com](https://uptimerobot.com) to ping `/health` every 5 minutes. Free Render instances sleep after 15 minutes of inactivity, which would miss reminders.

### Step 5 — Connect the webhook

1. In Meta Developer Console → **WhatsApp → Configuration**
2. Set **Webhook URL**: `https://your-bot.onrender.com/webhook`
3. Set **Verify token**: same as `WHATSAPP_VERIFY_TOKEN`
4. Click **Verify and save**
5. Subscribe to **messages** under Webhook fields

---

## Usage — WhatsApp Commands

Send these messages **to yourself** on WhatsApp (from the same number the bot monitors):

### Add a reminder

```
ADD <time> | <message>
```

**Time formats:**
```
ADD in 30 minutes | Call the dentist
ADD in 2 hours | Check the oven
ADD in 1 day | Submit report
ADD tomorrow 9am | Morning standup
ADD tomorrow 14:30 | Afternoon meeting
ADD 2024-12-25 08:00 | Merry Christmas!
ADD 9am | Quick reminder (today, or tomorrow if 9am already passed)
ADD 17:00 | End of day wrap-up
```

### List active reminders

```
LIST
```

### Delete a reminder

```
DEL 3
```
(where `3` is the reminder ID shown in LIST)

### Acknowledge the current reminder

Just reply with anything short:
```
ok  /  done  /  yes  /  got it  /  👍  /  ✅
```

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `WHATSAPP_TOKEN` | — | Permanent Meta access token |
| `WHATSAPP_PHONE_NUMBER_ID` | — | From Meta API Setup page |
| `WHATSAPP_VERIFY_TOKEN` | — | Any secret string you choose |
| `MY_WHATSAPP_NUMBER` | — | Your number, no `+` (e.g. `201234567890`) |
| `RETRY_INTERVAL_MINUTES` | `10` | How often to re-send if unacknowledged |
| `MAX_RETRIES` | `0` | Max attempts (0 = unlimited) |
| `PORT` | `3000` | HTTP port |

---

## REST API (optional)

The bot also exposes a small REST API if you want to add reminders programmatically:

```bash
# Add a reminder
curl -X POST https://your-bot.onrender.com/api/reminders \
  -H "Content-Type: application/json" \
  -d '{"message": "Take medication", "fireAt": "2024-12-25T09:00:00Z", "label": "meds"}'

# List all reminders
curl https://your-bot.onrender.com/api/reminders

# Delete reminder #3
curl -X DELETE https://your-bot.onrender.com/api/reminders/3
```

---

## Local development

```bash
npm install
cp .env.example .env   # fill in your values
npm run dev            # starts with nodemon for auto-reload
```

Use [ngrok](https://ngrok.com) to expose your local server to Meta:
```bash
ngrok http 3000
# Use the https URL as your webhook URL in Meta console
```

---

## Project structure

```
whatsapp-reminder-bot/
├── src/
│   ├── index.js       # Entry point, server startup
│   ├── routes.js      # Webhook + API routes + WhatsApp commands
│   ├── scheduler.js   # Cron job — fires due reminders
│   ├── db.js          # SQLite database helpers
│   ├── whatsapp.js    # WhatsApp Cloud API wrapper
│   └── replies.js     # Affirmative reply detection
├── .env.example
├── .gitignore
├── package.json
└── README.md
```
