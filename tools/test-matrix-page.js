#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const GoptData = require('../gopt-data.js');

const ROOT = path.resolve(__dirname, '..');

function assertNav() {
  const pages = ['index.html', 'record.html', 'rules.html', 'upload.html', 'data.html', 'technote.html', 'matrix.html'];
  pages.forEach(page => {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert(html.includes('href="matrix.html"'), `${page} should link to Matrix.`);
    const nav = html.match(/<nav[\s\S]*?<\/nav>/)?.[0] || '';
    assert(!nav.includes('technote.html'), `${page} should not show Tech Note in the top nav.`);
  });
}

function assertPlayersComeFromDataModel() {
  const parsed = GoptData.parseDataFile(fs.readFileSync(path.join(ROOT, 'data', 'GOPTdatav2.csv'), 'utf8'), {
    normalizePlayerName: true,
  });
  const players = new Set();
  parsed.rows.forEach(row => row.finishers.forEach(player => players.add(player)));
  assert(players.size >= 10, 'Expected current data model to provide a real player list.');
}

function assertExpectedAttendanceMath() {
  const weights = {
    OUT: 0,
    DOUBTFUL: 0.25,
    QUESTIONABLE: 0.5,
    PROBABLE: 1,
    '': 0,
  };
  const responses = ['PROBABLE', 'PROBABLE', 'DOUBTFUL', 'QUESTIONABLE', 'OUT', ''];
  const probable = responses.filter(response => response === 'PROBABLE').length;
  const expected = responses.reduce((total, response) => total + weights[response], 0);

  assert.strictEqual(probable, 2);
  assert.strictEqual(expected, 2.75);
}

function assertMatrixFiles() {
  const html = fs.readFileSync(path.join(ROOT, 'matrix.html'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'matrix.js'), 'utf8');
  const php = fs.readFileSync(path.join(ROOT, 'api', 'matrix.php'), 'utf8');

  assert(html.includes('matrix.js'), 'Matrix page should load matrix.js.');
  assert(js.includes('api/matrix'), 'Matrix client should use the Matrix API route.');
  assert(js.includes('Local preview mode'), 'Matrix client should have a static-server preview fallback.');
  assert(js.includes('matrix-status-probable'), 'Matrix client should render status-specific cells.');
  assert(php.includes('gopt-matrix-store'), 'Matrix API should store JSON separately from history data.');
  assert(php.includes('update_response'), 'Matrix API should support per-player response updates.');
}

function main() {
  assertNav();
  assertPlayersComeFromDataModel();
  assertExpectedAttendanceMath();
  assertMatrixFiles();
  console.log('Matrix page checks passed.');
}

main();
