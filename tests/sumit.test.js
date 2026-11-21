'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../lib/sumit.js');

const C = { CompanyID: 123, APIKey: 'k' };

test('no credentials, no calls', () => {
  assert.equal(S.ready({}), false);
  assert.throws(() => S.creds({ SUMIT_COMPANY_ID: '1' }));
  assert.equal(S.ready({ SUMIT_COMPANY_ID: '1', SUMIT_API_KEY: 'x' }), true);
});

test('the payment page body uses SUMIT field names and ties the payment to the monitor', () => {
  const b = S.beginBody(C, { tenant: 't1a2b3c', name: 'רון', email: 'r@x.co', phone: '0521234567', redirect: 'https://wa.abaitzik.com/api/pay/done' });
  assert.deepEqual(b.Credentials, C);
  assert.equal(b.ExternalIdentifier, 't1a2b3c');
  assert.equal(b.Customer.ExternalIdentifier, 't1a2b3c');
  assert.equal(b.Items[0].UnitPrice, 390);
  assert.equal(b.Items[0].Item.Name, S.ENTRY.name);
  assert.equal(b.VATIncluded, false);
  assert.equal(b.MaximumPayments, 1);
});

test('the monthly charge starts next month, on the saved card', () => {
  const b = S.recurringBody(C, 55, Date.UTC(2026, 10, 11));
  assert.equal(b.Customer.ID, 55);
  assert.equal(b.PaymentMethod, undefined);
  assert.equal(b.Items[0].Duration_Months, 1);
  assert.equal(b.Items[0].Item.Duration_Months, 1);
  assert.equal(b.Items[0].Date_Start, '2026-12-11');
  assert.equal(S.nextMonthIso(Date.UTC(2027, 0, 31)), '2027-02-28');
});

test('a payment counts only when valid and covering the price', () => {
  assert.equal(S.paymentOk({ ValidPayment: true, Amount: 460.2 }), true);
  assert.equal(S.paymentOk({ ValidPayment: false, Amount: 460.2 }), false);
  assert.equal(S.paymentOk({ ValidPayment: true, Amount: 1 }), false);
  assert.equal(S.paymentOk(null), false);
});

test('status as number or text', () => {
  assert.equal(S.ok({ Status: 0 }), true);
  assert.equal(S.ok({ Status: 'Success (0)' }), true);
  assert.equal(S.ok({ Status: 1 }), false);
});
