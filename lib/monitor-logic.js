'use strict';
// Logic the page and the tests share. This file is inlined into the page at
// build time, so it must stay free of require(), DOM access and localStorage.
// In Node it is a normal module; in the browser it lands on window.ML.
(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else window.ML=factory();
})(function () {
  return {
    version: 1,
  };
});
