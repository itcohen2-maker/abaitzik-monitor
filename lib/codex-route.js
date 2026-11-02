'use strict';

// Only the monitor's explicit Codex composer crosses this route. Ordinary
// voice notes, files, health pulses and messages for Claude keep their current
// destinations.
function requestText(message) {
  const raw = String(message || '').trim();
  const match = raw.match(/^(?:קודקס|codex)\s*[:：-]\s*([\s\S]+)$/i);
  return match ? match[1].trim() : '';
}

function queueText(event, text) {
  const id = String(event.id || 'unknown');
  const at = event.time ? new Date(Number(event.time) * 1000).toISOString() : new Date().toISOString();
  return [
    '[monitor-event:' + id + ']',
    'בקשה מאיציק דרך המוניטור. זמן קליטה: ' + at + '.',
    text
  ].join('\n');
}

async function route(event, bridge) {
  const text = requestText(event && event.message);
  if (!text) return { matched: false };
  if (typeof bridge.ensureMailbox === 'function') await bridge.ensureMailbox();
  const sourceId = 'ntfy-' + String(event.id || event.time || Date.now());
  const result = await bridge.push(text, 'user', queueText(event, text), sourceId);
  if (!result.delivery || !result.delivery.ok) {
    const why = result.delivery && result.delivery.why ? result.delivery.why : 'המסירה לשיחה נכשלה';
    throw new Error(why);
  }
  return { matched: true, duplicate: Boolean(result.delivery.duplicate), sourceId };
}

module.exports = { requestText, queueText, route };
