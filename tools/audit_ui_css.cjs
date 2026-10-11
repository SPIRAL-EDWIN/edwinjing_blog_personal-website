/* Read-only cascade inventory. See UI_REGRESSION.md for scope and limitations. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Split only top-level commas: :is(), :has(), attributes and quoted values
// belong to their selector rather than creating a new selector-list member.
function splitSelectors(text) {
  const result = [];
  let depth = 0, quote = '', start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { i++; continue; }
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      result.push(text.slice(start, i).trim()); start = i + 1;
    }
  }
  result.push(text.slice(start).trim());
  return result;
}

function conditions(context) {
  return context.flatMap(c => {
    // Only simple conjunctions can be compared as sets. Complex conditions
    // remain opaque and must match exactly; this is not a media-query solver.
    if (/^@media (?:screen|print|\([^()]+\))(?: and \([^()]+\))*$/.test(c))
      return c.slice(7).split(' and ').map(part => '@media ' + part);
    return [c];
  });
}

function audit(rules) {
  const parsed = rules.map(rule => ({ ...rule,
    selectors: splitSelectors(rule.selector), conditions: conditions(rule.context) }));
  const candidates = [];
  parsed.forEach((rule, index) => {
    for (const [property, value, priority] of rule.properties) {
      // Custom properties are an interface to runtime code, not dead-code
      // candidates merely because another declaration assigns them later.
      if (property.startsWith('--')) continue;
      const winners = rule.selectors.map(selector => {
        for (let next = parsed.length - 1; next > index; next--) {
          const other = parsed[next];
          if (!other.selectors.includes(selector) ||
              !other.conditions.every(c => rule.conditions.includes(c))) continue;
          const declaration = other.properties.find(p => p[0] === property &&
            (p[2] === 'important' || priority !== 'important'));
          if (declaration) return { selector, rule: next, declaration };
        }
        return null;
      });
      if (winners.every(Boolean)) candidates.push({ rule: index,
        selector: rule.selector, context: rule.context, property, value, priority, winners });
    }
  });
  return candidates;
}

async function main() {
  const { chromium } = require('playwright');
  const input = path.resolve(process.argv[2] || path.join(__dirname, '../docs/stylesheets/edwinos.css'));
  const output = path.resolve(process.argv[3] || '/tmp/edwinos-css-audit.json');
  if (input === output) throw new Error('The report must not overwrite the stylesheet.');
  const css = fs.readFileSync(input, 'utf8');
  const browser = await chromium.launch({ headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage();
    const inventory = await page.evaluate(text => {
      const sheet = new CSSStyleSheet(); sheet.replaceSync(text);
      const rules = [], otherRules = [];
      function walk(items, context = []) {
        for (const rule of items) {
          if (rule instanceof CSSStyleRule) rules.push({ selector: rule.selectorText, context,
            properties: Array.from(rule.style).map(p => [p, rule.style.getPropertyValue(p), rule.style.getPropertyPriority(p)]) });
          else if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule)
            walk(rule.cssRules, context.concat(rule.cssText.slice(0, rule.cssText.indexOf('{')).trim()));
          else otherRules.push({ type: rule.constructor.name, context });
        }
      }
      walk(sheet.cssRules);
      return { rules, otherRules };
    }, css);
    const candidates = audit(inventory.rules);
    const summary = {
      styleRules: inventory.rules.length,
      selectorMembers: inventory.rules.reduce((n, r) => n + splitSelectors(r.selector).length, 0),
      expandedProperties: inventory.rules.reduce((n, r) => n + r.properties.length, 0),
      importantExpandedProperties: inventory.rules.reduce((n, r) => n + r.properties.filter(p => p[2] === 'important').length, 0),
      candidateProperties: candidates.length
    };
    const report = { input, sha256: crypto.createHash('sha256').update(css).digest('hex'),
      browser: browser.version(), summary, candidates, ...inventory };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...summary, report: output }));
  } finally { await browser.close(); }
}

module.exports = { splitSelectors, conditions, audit };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 2; });
