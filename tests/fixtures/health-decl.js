'use strict';
// a valid health declaration as the booking page sends it (lib/book-health.js validate), for the booking tests
const answers = {};
['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'].forEach((q) => { answers[q] = { a: 'n' }; });
module.exports = { answers, note: '', sig: 'M20,80L32,50L45,82L58,44L72,84L88,46L104,78L124,60L150,70', agreed: true };
