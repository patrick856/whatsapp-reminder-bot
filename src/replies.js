// src/replies.js — detect affirmative replies from the user

// Words/phrases that count as "acknowledged"
const AFFIRMATIVE_PATTERNS = [
  /^ok$/i,
  /^okay$/i,
  /^yes$/i,
  /^yep$/i,
  /^yup$/i,
  /^done$/i,
  /^got\s*it$/i,
  /^ack(nowledged)?$/i,
  /^received$/i,
  /^noted$/i,
  /^check$/i,
  /^sure$/i,
  /^alright$/i,
  /^will\s*do$/i,
  /^on\s*it$/i,
  /^👍/,
  /^✅/,
  /^✓/,
];

/**
 * Returns true if the message text looks like an affirmative reply.
 * Deliberately lenient — any message containing these words counts.
 */
function isAffirmative(text) {
  if (!text) return false;
  const trimmed = text.trim();

  // Single-word / short replies checked against patterns
  for (const pattern of AFFIRMATIVE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  // Also treat ANY reply shorter than 5 words as an acknowledgement,
  // since the user is messaging the bot — it's almost certainly a reply to a reminder.
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount <= 5) return true;

  return false;
}

module.exports = { isAffirmative };
