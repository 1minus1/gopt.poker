#!/usr/bin/env node

const assert = require('assert');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { File } = require('node:buffer');
const GoptData = require('../gopt-data.js');

const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'GOPTdatav2.csv');
const ADMIN_USER = require('crypto').randomBytes(16).toString('hex');
const ADMIN_PASSWORD = require('crypto').randomBytes(32).toString('hex');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readCanonicalData() {
  return GoptData.parseDataFile(fs.readFileSync(DATA_PATH, 'utf8'), {
    normalizePlayerName: true,
  });
}

function assertNoOldSourceReferences() {
  const forbiddenPattern = [
    'GOPT' + 'history',
    'looksLike' + 'Legacy',
    'parse' + 'Legacy',
    ['validate_', 'leg', 'acy'].join(''),
    'files/GOPT' + 'history',
  ].join('|');
  const result = spawnSync('git', ['grep', '-n', '-E', forbiddenPattern, '--', '.'], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  assert.strictEqual(result.status, 1, `Found old data-source references:\n${result.stdout}${result.stderr}`);
}

function assertRecordPageUsesV2Fields() {
  const recordHtml = fs.readFileSync(path.join(ROOT, 'record.html'), 'utf8');
  const recordJs = fs.readFileSync(path.join(ROOT, 'record.js'), 'utf8');

  assert(recordHtml.includes('id="host-select"'), 'Record page should include a host selector.');
  assert(recordHtml.includes('id="major-name-select"'), 'Record page should include a major-name selector.');
  assert(recordHtml.includes('type="date"'), 'Record page should use a date-only event input.');
  assert(!recordHtml.includes('type="datetime-local"'), 'Record page should not ask for an event time.');
  assert(!recordHtml.includes('id="major-name-input"'), 'Record page should not use the old freeform-only major input.');
  assert(recordJs.includes('host: details.host'), 'Generated rows should persist the selected host.');
  assert(recordJs.includes("isOrdered: 'YES'"), 'Generated rows should be ordered.');
  assert(recordJs.includes('normalizeMajorName(details.majorName)'), 'Generated rows should normalize major names.');
  assert(recordJs.includes('refreshMaxHistoryVersion()'), 'Record generation should refresh the max server version.');
  assert(recordJs.includes('GOPTdatav2.csv'), 'Record uploads/downloads should name the v2 CSV file.');
}

function withVersion(rows, versionNumber) {
  return rows.map(row => ({
    ...row,
    historyVersion: versionNumber,
  }));
}

function makeGeneratedDataText(parsed, details) {
  const nextVersion = details.versionNumber;
  const dateText = GoptData.formatUsDateFromTimestamp(details.timestamp);
  const isMajor = details.isMajor ? 'YES' : 'NO';
  const majorName = details.isMajor
    ? GoptData.normalizeMajorName(details.majorName, 'YES')
    : '';
  const newRows = details.tournaments.map((finishers, index) => ({
    historyVersion: nextVersion,
    league: 'GOPT',
    season: details.season,
    dateText,
    timestamp: details.timestamp,
    isMajor,
    majorName,
    host: details.host,
    pointsAtStake: details.isMajor ? '40' : '20',
    tournamentNumber: index + 1,
    isOrdered: 'YES',
    finishers,
  }));

  return GoptData.serializeDataV2([...withVersion(parsed.rows, nextVersion), ...newRows], {
    versionNumber: nextVersion,
  });
}

function buildGeneratedFiles() {
  const base = readCanonicalData();
  const standardVersion = Number(base.versionNumber) + 1;
  const standardText = makeGeneratedDataText(base, {
    versionNumber: standardVersion,
    season: '2099',
    timestamp: Math.floor(new Date(2099, 4, 17, 19, 30).getTime() / 1000),
    isMajor: false,
    majorName: '',
    host: 'Workflow Host',
    tournaments: [
      ['Workflow Alice', 'Workflow Bob', 'Workflow Casey'],
      ['Workflow Alice', 'Workflow Casey', 'Workflow Bob'],
    ],
  });
  const standardParsed = GoptData.parseDataFile(standardText, { normalizePlayerName: true });
  const majorVersion = standardVersion + 1;
  const majorText = makeGeneratedDataText(standardParsed, {
    versionNumber: majorVersion,
    season: '2100',
    timestamp: Math.floor(new Date(2100, 0, 12, 18, 0).getTime() / 1000),
    isMajor: true,
    majorName: 'DNO 2100',
    host: 'Workflow Major Host',
    tournaments: [
      ['Workflow Major Winner', 'Workflow Alice', 'Workflow Bob', 'Workflow Casey'],
    ],
  });
  const majorParsed = GoptData.parseDataFile(majorText, { normalizePlayerName: true });

  assert.strictEqual(standardParsed.versionNumber, standardVersion);
  assert(standardParsed.rows.every(row => row.historyVersion === standardVersion));
  assert.strictEqual(majorParsed.versionNumber, majorVersion);
  assert(majorParsed.rows.every(row => row.historyVersion === majorVersion));

  const standardNight = GoptData.buildNights(standardParsed.rows).find(night => night.season === '2099');
  assert(standardNight, 'Generated standard night should appear in night summaries.');
  assert.strictEqual(standardNight.host, 'Workflow Host');
  assert.strictEqual(standardNight.winner, 'Workflow Alice');
  assert.strictEqual(standardNight.isMajor, 'NO');
  assert(standardNight.rows.every(row => row.isOrdered === 'YES'), 'Generated standard rows should be ordered.');

  const majorNight = GoptData.buildNights(majorParsed.rows).find(night => night.season === '2100');
  assert(majorNight, 'Generated major night should appear in night summaries.');
  assert.strictEqual(majorNight.host, 'Workflow Major Host');
  assert.strictEqual(majorNight.winner, 'Workflow Major Winner');
  assert.strictEqual(majorNight.isMajor, 'YES');
  assert.strictEqual(majorNight.majorName, 'Downtown Newark Open');
  assert(majorNight.rows.every(row => row.isOrdered === 'YES'), 'Generated major rows should be ordered.');

  const stats = GoptData.calculateStats(majorParsed.rows);
  assert(stats.allTime['Workflow Alice'].bracelets >= 1, 'New standard winner should have a bracelet.');
  assert.strictEqual(stats.bySeason['2100']['Workflow Major Winner'].majorBracelets, 1);
  assert(stats.allTime['Workflow Major Winner'].points > 0, 'New major winner should receive points.');

  return { base, standardText, standardVersion, majorText, majorVersion };
}

function makePasswordHash() {
  const result = spawnSync('php', ['-r', `echo password_hash('${ADMIN_PASSWORD}', PASSWORD_DEFAULT);`], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.strictEqual(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function hasLocalPhp() {
  const result = spawnSync('php', ['-v'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return result.status === 0;
}

function startPhpServer(storeDir) {
  const port = 19000 + Math.floor(Math.random() * 20000);
  const passwordHash = makePasswordHash();
  const server = spawn('php', ['-S', `127.0.0.1:${port}`, 'router.php'], {
    cwd: ROOT,
    env: {
      ...process.env,
      GOPT_ADMIN_USERNAME: ADMIN_USER,
      GOPT_ADMIN_PASSWORD_HASH: passwordHash,
      GOPT_HISTORY_STORE_DIR: storeDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', chunk => { output += chunk.toString(); });
  server.stderr.on('data', chunk => { output += chunk.toString(); });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    server,
    getOutput: () => output,
  };
}

async function fetchJson(baseUrl, endpoint, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, options);
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(`${endpoint} did not return JSON: ${text.slice(0, 120)}`);
  }
  return { response, result };
}

async function waitForServer(baseUrl, server, getOutput) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`PHP server exited early:\n${getOutput()}`);
    }
    try {
      const { response } = await fetchJson(baseUrl, '/api/history/versions');
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(100);
  }
  throw new Error(`PHP server did not become ready:\n${getOutput()}`);
}

async function uploadData(baseUrl, text, source = 'workflow-test') {
  const formData = new FormData();
  formData.append('username', ADMIN_USER);
  formData.append('password', ADMIN_PASSWORD);
  formData.append('source', source);
  formData.append('label', `Workflow ${source}`);
  formData.append('historyFile', new File([text], 'GOPTdatav2.csv', { type: 'text/csv' }));

  return fetchJson(baseUrl, '/upload-history', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: formData,
  });
}

async function postJson(baseUrl, endpoint, body) {
  return fetchJson(baseUrl, endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: ADMIN_USER,
      password: ADMIN_PASSWORD,
      ...body,
    }),
  });
}

async function runAdminWorkflowTests(files) {
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gopt-v2-store-'));
  const { baseUrl, server, getOutput } = startPhpServer(storeDir);

  try {
    await waitForServer(baseUrl, server, getOutput);

    let versions = (await fetchJson(baseUrl, '/api/history/versions')).result.versions;
    assert.strictEqual(versions.length, 1, 'Initial request should seed one v2 version.');
    assert.strictEqual(versions[0].format, 'v2');
    assert.strictEqual(versions[0].isOldest, true);
    const seedId = versions[0].id;

    const currentResponse = await fetch(`${baseUrl}/api/history/current`);
    assert.strictEqual(currentResponse.headers.get('x-gopt-history-format'), 'v2');
    const currentText = await currentResponse.text();
    assert(GoptData.looksLikeSupportedDataFile(currentText), 'Current API should return v2 CSV.');

    const unsupported = await uploadData(baseUrl, '1\nGOPT,2099,4070908800,NO,,20,Workflow Alice\n', 'old-format-check');
    assert.strictEqual(unsupported.response.status, 400);
    assert.match(unsupported.result.message, /GOPTdatav2\.csv/);

    const uploadedStandard = await uploadData(baseUrl, files.standardText, 'record-standard');
    assert.strictEqual(uploadedStandard.response.status, 200);
    assert.strictEqual(uploadedStandard.result.versionNumber, String(files.standardVersion));
    const standardId = uploadedStandard.result.versionId;

    const duplicate = await uploadData(baseUrl, files.standardText, 'record-standard-duplicate');
    assert.strictEqual(duplicate.response.status, 409);
    assert.match(duplicate.result.message, /already exists/);

    const uploadedMajor = await uploadData(baseUrl, files.majorText, 'record-major');
    assert.strictEqual(uploadedMajor.response.status, 200);
    assert.strictEqual(uploadedMajor.result.versionNumber, String(files.majorVersion));
    const majorId = uploadedMajor.result.versionId;

    const currentMajorText = await (await fetch(`${baseUrl}/api/history/current`)).text();
    const currentMajor = GoptData.parseDataFile(currentMajorText, { normalizePlayerName: true });
    const majorNight = GoptData.buildNights(currentMajor.rows).find(night => night.season === '2100');
    assert(majorNight, 'Uploaded major should appear in current data.');
    assert.strictEqual(majorNight.majorName, 'Downtown Newark Open');
    assert.strictEqual(majorNight.host, 'Workflow Major Host');
    assert.strictEqual(majorNight.winner, 'Workflow Major Winner');

    const zipResponse = await fetch(`${baseUrl}/api/history/versions.zip`);
    assert.strictEqual(zipResponse.status, 200);
    const zipHeader = Buffer.from(await zipResponse.arrayBuffer()).subarray(0, 2).toString('hex');
    assert.strictEqual(zipHeader, '504b', 'Version archive should be a zip file.');

    const reverted = await postJson(baseUrl, '/api/history/revert', { versionId: standardId });
    assert.strictEqual(reverted.response.status, 200);
    assert.strictEqual(reverted.result.versionNumber, String(files.standardVersion));

    const currentStandardText = await (await fetch(`${baseUrl}/api/history/current`)).text();
    const currentStandard = GoptData.parseDataFile(currentStandardText, { normalizePlayerName: true });
    assert(GoptData.buildNights(currentStandard.rows).some(night => night.season === '2099'));
    assert(!GoptData.buildNights(currentStandard.rows).some(night => night.season === '2100'));

    const deletedMajor = await postJson(baseUrl, '/api/history/delete', { versionId: majorId });
    assert.strictEqual(deletedMajor.response.status, 200);
    assert.strictEqual(deletedMajor.result.versionNumber, String(files.majorVersion));

    const protectedSeed = await postJson(baseUrl, '/api/history/delete', { versionId: seedId });
    assert.strictEqual(protectedSeed.response.status, 409);
    assert.match(protectedSeed.result.message, /oldest data version cannot be deleted/i);

    versions = (await fetchJson(baseUrl, '/api/history/versions')).result.versions;
    assert(versions.every(version => version.format === 'v2'), 'All listed versions should be v2.');
    assert(versions.some(version => version.id === standardId && version.isCurrent));
    assert(!versions.some(version => version.id === majorId), 'Deleted version should leave the index.');
  } finally {
    server.kill();
  }
}

async function main() {
  assertNoOldSourceReferences();
  assertRecordPageUsesV2Fields();
  const generatedFiles = buildGeneratedFiles();
  if (!hasLocalPhp()) {
    const message = 'Local PHP is not available; skipped live Admin API workflow tests.';
    if (process.env.REQUIRE_PHP_TESTS === '1') {
      throw new Error(message);
    }
    console.warn(message);
    console.log('V2 record-generation tests passed.');
    return;
  }
  await runAdminWorkflowTests(generatedFiles);
  console.log('V2 record/admin workflow tests passed.');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
