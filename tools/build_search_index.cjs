#!/usr/bin/env node
'use strict';

// Build with the same tokenizer as the browser; no npm install or network work.
const fs = require('node:fs');
const path = require('node:path');
const directory = path.join(__dirname, '../docs/assets/javascripts/workers');
const lunr = require(path.join(directory, 'vendor/lunr.min.js'));
const search = require(path.join(directory, 'search-engine.js'));

function prebuild(indexPath) {
  const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  // Material forwards only { config, docs } to its worker. Put extension data
  // inside config so the prebuilt index survives that protocol boundary.
  data.config = data.config || {};
  data.config.edwinos_index = search.buildSerializedIndex(data.docs || [], lunr);
  data.config.edwinos_search_version = search.VERSION;
  const temporary = indexPath + '.prebuild.tmp';
  fs.writeFileSync(temporary, JSON.stringify(data));
  fs.renameSync(temporary, indexPath);
  return data.docs.length;
}

module.exports = { prebuild };
if (require.main === module) {
  if (!process.argv[2]) throw new Error('Usage: node tools/build_search_index.cjs SEARCH_INDEX_JSON');
  console.log('Prebuilt Lunr index for ' + prebuild(process.argv[2]) + ' search records');
}
