'use strict';
/*
  11.11.2026, Itzik: "את כל השיחות ל API. שום מנוי של מוניטור לא נוגע במנוי שלי."
  Everything the server runs with Claude on a customer's behalf outside the customer's own worker (the fast chat and
  its trainings in wa-bridge.js, the mail sorting in mail-sync.js) uses the customers' API key, CUSTOMER_API_KEY in
  /etc/monitor.env (Console key "monitor-customers-chat-mail"), never Itzik's subscription token.
  Fails closed: without the key it throws, so nothing quietly falls back to the subscription.
  Each customer's own worker has its own key in /etc/<id>.env (setup/tenant-api-key.sh).
*/
function customerEnv(base) {
  const src = base || process.env;
  const k = String(src.CUSTOMER_API_KEY || '').trim();
  if (!/^sk-ant-[A-Za-z0-9_-]{40,}$/.test(k)) throw new Error('no CUSTOMER_API_KEY: a customer call never runs on the owner subscription');
  const env = Object.assign({}, src, { ANTHROPIC_API_KEY: k });
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  delete env.CUSTOMER_API_KEY;
  return env;
}

module.exports = { customerEnv };
