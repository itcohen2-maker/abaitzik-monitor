'use strict';
/*
  12.11.2026, Itzik decided to connect customers' WhatsApp numbers through Kapso (a WhatsApp BSP) to start
  selling; the same number moves to our own Meta app later. Kapso exposes a Meta compatible proxy and forwards
  webhooks in Meta's exact payload, so the only differences are the base URL, the auth header, the media download
  and the webhook signature. Config driven: data/wa.json with `kapsoKey` uses Kapso, otherwise Meta direct as always.
    kapsoKey, kapsoSecret (webhook secret_key), kapsoGraph (default v24.0)
*/
const crypto = require('crypto');

function isKapso(c) { return !!(c && c.kapsoKey); }

// Base URL including the version, no trailing slash.
function base(c) {
  c = c || {};
  return isKapso(c)
    ? 'https://api.kapso.ai/meta/whatsapp/' + (c.kapsoGraph || 'v24.0')
    : 'https://graph.facebook.com/' + (c.graph || 'v21.0');
}

// Auth headers for an API call.
function auth(c) {
  c = c || {};
  return isKapso(c) ? { 'X-API-Key': c.kapsoKey } : { Authorization: 'Bearer ' + c.token };
}

// URL that returns a media's JSON (url, mime_type, file_size...).
function mediaMetaUrl(c, mediaId) {
  const u = base(c) + '/' + mediaId;
  return isKapso(c) ? u + '?phone_number_id=' + encodeURIComponent(c.phoneId || '') : u;
}

// From the media JSON: where to download and with which headers.
function mediaDownload(c, j) {
  j = j || {};
  if (isKapso(c)) {
    if (j.download_url) return { url: j.download_url, headers: {} };
    return { url: j.url, headers: auth(c) };
  }
  return { url: j.url, headers: auth(c) };
}

function eq(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function hdr(headers, name) {
  if (!headers) return '';
  const k = Object.keys(headers).find(function (h) { return h.toLowerCase() === name; });
  const v = k ? headers[k] : '';
  return Array.isArray(v) ? String(v[0] || '') : String(v || '');
}

// Meta: X-Hub-Signature-256 = sha256=<hex> with appSecret. Kapso: X-Webhook-Signature = <hex> with kapsoSecret.
function sigOk(c, raw, headers) {
  try {
    c = c || {};
    if (c.appSecret) {
      const want = 'sha256=' + crypto.createHmac('sha256', String(c.appSecret)).update(raw).digest('hex');
      if (eq(hdr(headers, 'x-hub-signature-256'), want)) return true;
    }
    if (c.kapsoSecret) {
      const want = crypto.createHmac('sha256', String(c.kapsoSecret)).update(raw).digest('hex');
      if (eq(hdr(headers, 'x-webhook-signature'), want)) return true;
    }
    return false;
  } catch (e) { return false; }
}

module.exports = { isKapso, base, auth, mediaMetaUrl, mediaDownload, sigOk };
