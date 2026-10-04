#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
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
    IN: 1,
    OUT: 0,
    DOUBTFUL: 0.25,
    QUESTIONABLE: 0.5,
    PROBABLE: 0.75,
    '': 0,
  };
  const responses = ['IN', 'PROBABLE', 'PROBABLE', 'DOUBTFUL', 'QUESTIONABLE', 'OUT', ''];
  const probable = responses.filter(response => response === 'PROBABLE' || response === 'IN').length;
  const expected = responses.reduce((total, response) => total + weights[response], 0);

  assert.strictEqual(probable, 3);
  assert.strictEqual(expected, 3.25);
}

function assertMatrixFiles() {
  const html = fs.readFileSync(path.join(ROOT, 'matrix.html'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'matrix.js'), 'utf8');
  const php = fs.readFileSync(path.join(ROOT, 'api', 'matrix.php'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

  assert(html.includes('matrix.js'), 'Matrix page should load matrix.js.');
  assert(html.includes('styles.css?v=matrix-delta-lock-20260516'), 'Matrix stylesheet URL should be cache-busted.');
  assert(html.includes('matrix.js?v=delete-confirmation-20261004'), 'Matrix script URL should be cache-busted.');
  assert(html.includes('<details class="matrix-section matrix-create-disclosure">'), 'New Matrix form should be behind a disclosure.');
  assert(html.includes('<summary>New Matrix</summary>'), 'New Matrix disclosure should have a clear summary.');
  assert(js.includes('api/matrix'), 'Matrix client should use the Matrix API route.');
  assert(js.includes('Local preview mode'), 'Matrix client should have a static-server preview fallback.');
  assert(js.includes('matrix-status-probable'), 'Matrix client should render status-specific cells.');
  assert(js.includes('# (PROBABLE + IN)'), 'Matrix totals should count PROBABLE plus IN players.');
  assert(js.includes('Expected #'), 'Matrix totals should use the shorter Expected # label.');
  assert(js.includes('DOUBTFUL (25%)'), 'Matrix status selector should show percentage likelihoods.');
  assert(js.includes('QUESTIONABLE (50%)'), 'Matrix status selector should show percentage likelihoods.');
  assert(js.includes('PROBABLE (75%)'), 'Matrix status selector should show percentage likelihoods.');
  assert(js.includes('IN (100%)'), 'Matrix status selector should show percentage likelihoods.');
  assert(js.includes('Choose player'), 'Matrix player selector should start with no player selected.');
  assert(js.includes("state.selectedPlayers[matrix.id] || ''"), 'Matrix cards should start with a clean read-only table.');
  assert(!js.includes("['No response', 'missing'"), 'Matrix totals should not render the no response row.');
  assert(js.includes('--matrix-table-min-width'), 'Matrix tables should size from their date count.');
  assert(js.includes('matrix-save-bar'), 'Matrix editor should keep the save control visible near the editing area.');
  assert(js.includes('saveBar.hidden = true'), 'Matrix save control should be hidden until there are changes.');
  assert(js.includes('saveBar.hidden = !isDirty'), 'Matrix save control should appear only for unsaved changes.');
  assert(js.includes('has-unsaved-changes'), 'Matrix editor should mark changed availability as unsaved.');
  assert(js.includes('Save Changes'), 'Matrix save button should change text when availability is dirty.');
  assert(js.includes('data-delete-matrix-id'), 'Matrix client should render a matrix delete control.');
  assert(js.includes('set_delta_lock'), 'Matrix client should support delta locking one proposed date.');
  assert(js.includes('deltaLockedDateId'), 'Matrix client should store the delta-locked date in the matrix data.');
  assert(js.includes('state.eventDateIds.has(dateId)'), 'Matrix client should auto-lock past candidate dates that match completed events.');
  assert(js.includes('This matrix is closed'), 'Matrix client should explain read-only past matrices.');
  assert(css.includes('var(--matrix-table-min-width'), 'Matrix CSS should use the dynamic table min-width.');
  const matrixLib = fs.readFileSync(path.join(ROOT, 'api', 'matrix-lib.php'), 'utf8');
  assert(matrixLib.includes('gopt-matrix-store'), 'Matrix API should store JSON separately from history data.');
  assert(matrixLib.includes('gopt_find_auto_delta_lock_date_id'), 'Matrix API should auto-lock past candidate dates that match completed events.');
  assert(php.includes('update_response'), 'Matrix API should support per-player response updates.');
  assert(php.includes('set_delta_lock'), 'Matrix API should support delta locking.');
  assert(php.includes('gopt_delete_matrix'), 'Matrix API should support matrix deletion.');
}

function assertDeleteConfirmation() {
  const source = fs.readFileSync(path.join(ROOT, 'matrix.js'), 'utf8');
  const confirmation = source.match(/function confirmMatrixDelete\(matrix\) \{[\s\S]*?\n\}(?=\n\nfunction renderMatrices)/)?.[0];
  assert(confirmation, 'Expected the production deletion confirmation function.');
  const matrix = { name: 'Saturday Poker' };
  for (const input of [null, '', matrix.name, 'yes', 'YES', 'Yes']) {
    let prompt;
    const confirm = vm.runInNewContext(`(${confirmation})`, {
      window: { prompt: message => { prompt = message; return input; } },
    });
    const result = confirm(matrix);
    assert.strictEqual(result.confirmed, input === 'Yes', 'Only submitted Yes confirms deletion.');
    assert(prompt.includes(matrix.name), 'Warning must identify the matrix.');
    assert(prompt.includes('every availability response') && prompt.includes('There is no undo.'), 'Warning must explain permanent data loss.');
    assert(prompt.includes("Type 'Yes' to confirm"));
    if (input === null) assert.strictEqual(result.message, '', 'Cancel must not show an error.');
  }
}

function main() {
  assertNav();
  assertPlayersComeFromDataModel();
  assertExpectedAttendanceMath();
  assertMatrixFiles();
  assertDeleteConfirmation();
  console.log('Matrix page checks passed.');
}

main();
