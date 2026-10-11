'use strict';
const assert = require('node:assert/strict');
const { splitSelectors, conditions, audit } = require('./audit_ui_css.cjs');

assert.deepEqual(splitSelectors('body:is(.home, .profile), [data-x="a,b"]:has(a, b)'),
  ['body:is(.home, .profile)', '[data-x="a,b"]:has(a, b)']);
assert.deepEqual(splitSelectors('.escaped\\,comma, a'), ['.escaped\\,comma', 'a']);
assert.deepEqual(conditions(['@media screen and (min-width: 76.25em) and (max-width: 88em)']),
  ['@media screen', '@media (min-width: 76.25em)', '@media (max-width: 88em)']);
assert.deepEqual(conditions(['@media (width > 10px) or (height > 10px)']),
  ['@media (width > 10px) or (height > 10px)']);

const rule = (selector, priority = '', context = [], property = 'color') =>
  ({ selector, context, properties: [[property, 'red', priority]] });
assert.equal(audit([rule('.a'), rule('.a')]).length, 1);
assert.equal(audit([rule('.a', 'important'), rule('.a')]).length, 0);
assert.equal(audit([rule('.a'), rule('.a', 'important')]).length, 1);
assert.equal(audit([rule('.a, .b'), rule('.a')]).length, 0);
assert.equal(audit([rule('.a, .b'), rule('.a'), rule('.b')]).length, 1);
assert.equal(audit([rule('.a'), rule('.parent .a')]).length, 0);
assert.equal(audit([rule('.a', '', ['@media screen and (min-width: 76.25em) and (max-width: 88em)']),
  rule('.a', '', ['@media screen and (min-width: 76.25em)'])]).length, 1);
assert.equal(audit([rule('.a'), rule('.a', '', ['@media screen'])]).length, 0);
assert.equal(audit([rule('.a', '', ['@supports (display: grid)']), rule('.a')]).length, 1);
assert.equal(audit([rule('.a'), rule('.a', '', ['@supports (display: grid)'])]).length, 0);
assert.equal(audit([rule('.a', '', [], '--token'), rule('.a', '', [], '--token')]).length, 0);
console.log('CSS audit selector/context/importance contracts passed.');
