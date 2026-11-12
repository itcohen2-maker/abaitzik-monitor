'use strict';
/*
  11.11.2026: payment for the entry package through SUMIT (plans/2026-11-11-self-signup-trial-sumit.md).
  Field names from SUMIT's own spec, https://api.sumit.co.il/swagger/v1/swagger.json (read 11.11.2026):
    POST /billing/payments/beginredirect/  Credentials{CompanyID,APIKey}, Customer, Items[{Item{Name},Quantity,UnitPrice}],
                                           RedirectURL (gets OG-PaymentID, OG-CustomerID, OG-ExternalIdentifier), ExternalIdentifier
                                           -> Data.RedirectURL
    POST /billing/payments/get/            PaymentID -> Data.Payment{ID,CustomerID,ValidPayment,Amount,Status}
    POST /billing/recurring/charge/        Customer{ID}, Items[{Item{Name,Duration_Months},Quantity,UnitPrice,Date_Start,Duration_Months}]
                                           the card saved by the first payment is used (PaymentMethod left empty)
  Credentials: SUMIT_COMPANY_ID and SUMIT_API_KEY in /etc/monitor.env. Without them every call throws, so the page
  falls back to a request to Itzik.
*/
const https = require('https');

const ENTRY = { name: 'המוניטור העסקי, חבילת כניסה', price: 390 };
const API = 'api.sumit.co.il';

function creds(env) {
  const e = env || process.env;
  const id = Number(e.SUMIT_COMPANY_ID), key = String(e.SUMIT_API_KEY || '').trim();
  if (!id || !key) throw new Error('no SUMIT credentials');
  return { CompanyID: id, APIKey: key };
}
function ready(env) { try { creds(env); return true; } catch (e) { return false; } }

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body), 'utf8');
    const r = https.request({ method: 'POST', hostname: API, path, headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, (res) => {
      const ch = []; res.on('data', (c) => ch.push(c));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(Buffer.concat(ch).toString('utf8')); } catch (e) { return reject(new Error('sumit ' + res.statusCode + ' not json')); }
        if (!ok(j)) return reject(new Error('sumit: ' + (j.UserErrorMessage || j.TechnicalErrorDetails || 'status ' + j.Status)));
        resolve(j.Data || {});
      });
    });
    r.on('error', reject);
    r.setTimeout(30000, () => r.destroy(new Error('timeout')));
    r.end(data);
  });
}
// Status comes as 0 or "Success (0)" depending on the serializer.
function ok(j) { return !!j && (j.Status === 0 || j.Status === '0' || /^Success/.test(String(j.Status))); }

// The request bodies, pure, so the tests can check them without the network.
function beginBody(c, o) {
  return {
    Credentials: c,
    Customer: { Name: o.name, EmailAddress: o.email || null, Phone: o.phone || null, ExternalIdentifier: o.tenant, SearchMode: 2 },
    // 12.11.2026: a customer's own offer (lib/pay-offer.js) brings its own lines; default the entry package.
    Items: (o.items && o.items.length ? o.items : [{ name: ENTRY.name, price: ENTRY.price }]).map((x) => ({ Item: { Name: x.name }, Quantity: 1, UnitPrice: x.price })),
    VATIncluded: false,
    RedirectURL: o.redirect,
    CancelRedirectURL: o.cancel || null,
    ExternalIdentifier: o.tenant,
    MaximumPayments: 1,
    ExpirationHours: 24,
    Header: 'IT Solution · המוניטור העסקי',
    UpdateCustomerOnSuccess: true,
    UpdateOrganizationOnSuccess: true,
    // 12.11.2026 (Itzik): the invoice receipt SUMIT issues goes to the customer by mail.
    SendUpdateByEmailAddress: o.email || null,
  };
}
function nextMonthIso(now) {
  const d = new Date(now == null ? Date.now() : now);
  const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, Math.min(d.getUTCDate(), 28)));
  return n.toISOString().slice(0, 10);
}
function recurringBody(c, customerId, now, monthly) {
  const m = monthly || { name: ENTRY.name, price: ENTRY.price, note: 'מנוי חודשי, חבילת כניסה' };
  return {
    Credentials: c,
    Customer: { ID: customerId },
    Items: [{ Item: { Name: m.name, Duration_Months: 1 }, Quantity: 1, UnitPrice: m.price,
      Date_Start: nextMonthIso(now), Duration_Months: 1, Description: m.note || 'מנוי חודשי' }],
    UpdateCustomerByEmail: true,
    UpdateCustomerByEmail_AttachDocument: true,
  };
}

async function beginEntry(o, env) { return (await post('/billing/payments/beginredirect/', beginBody(creds(env), o))).RedirectURL; }
async function getPayment(id, env) { return (await post('/billing/payments/get/', { Credentials: creds(env), PaymentID: Number(id) })).Payment || null; }
async function startRecurring(customerId, env, now, monthly) { return post('/billing/recurring/charge/', recurringBody(creds(env), Number(customerId), now, monthly)); }

// A first payment counts only when SUMIT says it is valid and it covers the entry price (VAT is added on top).
function paymentOk(p, min) { return !!(p && p.ValidPayment === true && Number(p.Amount) >= (min || ENTRY.price)); }

module.exports = { ENTRY, ready, creds, beginBody, recurringBody, nextMonthIso, beginEntry, getPayment, startRecurring, paymentOk, ok };
