#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const GoptData = require('../gopt-data.js');

const ROOT = path.resolve(__dirname, '..');
const LEGACY_PATH = path.join(ROOT, 'files', 'GOPThistory.txt');
const V2_PATH = path.join(ROOT, 'data', 'GOPTdatav2.csv');

function readParsed(filePath) {
  return GoptData.parseDataFile(fs.readFileSync(filePath, 'utf8'), {
    normalizePlayerName: true,
  });
}

function roundPoints(value) {
  return Number(value.toFixed(4));
}

function flattenStats(stats) {
  const rows = [];

  function addBucket(scope, players) {
    Object.entries(players).forEach(([player, totals]) => {
      rows.push({
        key: `${scope}|${player}`,
        scope,
        player,
        points: roundPoints(totals.points),
        bracelets: totals.bracelets,
        majorBracelets: totals.majorBracelets,
      });
    });
  }

  addBucket('All Time', stats.allTime);
  Object.keys(stats.bySeason).sort().forEach(season => {
    addBucket(season, stats.bySeason[season]);
  });

  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

function compareRows(label, legacyRows, v2Rows) {
  const errors = [];
  const legacyByKey = new Map(legacyRows.map(row => [row.key, row]));
  const v2ByKey = new Map(v2Rows.map(row => [row.key, row]));
  const keys = new Set([...legacyByKey.keys(), ...v2ByKey.keys()]);

  function isZeroOnly(row) {
    return row && row.points === 0 && row.bracelets === 0 && row.majorBracelets === 0;
  }

  [...keys].sort().forEach(key => {
    const legacy = legacyByKey.get(key);
    const v2 = v2ByKey.get(key);

    if (!legacy || !v2) {
      const existing = legacy || v2;
      if (isZeroOnly(existing)) {
        return;
      }
      errors.push(`${label}: ${key} exists only in ${legacy ? 'legacy' : 'v2'}.`);
      return;
    }

    ['points', 'bracelets', 'majorBracelets'].forEach(field => {
      if (legacy[field] !== v2[field]) {
        errors.push(`${label}: ${key} ${field} legacy=${legacy[field]} v2=${v2[field]}`);
      }
    });
  });

  return errors;
}

function summarizeTop(stats, field) {
  return Object.entries(stats.allTime)
    .sort(([, a], [, b]) => {
      if (b[field] !== a[field]) return b[field] - a[field];
      return b.points - a.points;
    })
    .slice(0, 5)
    .map(([player, totals]) => `${player} ${totals[field]}`)
    .join(', ');
}

function main() {
  const legacy = readParsed(LEGACY_PATH);
  const v2 = readParsed(V2_PATH);
  const legacyStats = GoptData.calculateStats(legacy.rows);
  const v2Stats = GoptData.calculateStats(v2.rows);
  const legacyAsV2 = GoptData.parseDataFile(
    GoptData.serializeDataV2(legacy.rows, { versionNumber: legacy.versionNumber }),
    { normalizePlayerName: true }
  );
  const legacyAsV2Stats = GoptData.calculateStats(legacyAsV2.rows);
  const errors = [];

  if (legacy.rows.length !== v2.rows.length) {
    errors.push(`Tournament row count mismatch: legacy=${legacy.rows.length} v2=${v2.rows.length}`);
  }
  if (legacyStats.nightCount !== v2Stats.nightCount) {
    errors.push(`Night count mismatch: legacy=${legacyStats.nightCount} v2=${v2Stats.nightCount}`);
  }

  errors.push(...compareRows('stats', flattenStats(legacyStats), flattenStats(v2Stats)));
  errors.push(...compareRows('legacy to v2 serialization', flattenStats(legacyStats), flattenStats(legacyAsV2Stats)));

  if (errors.length) {
    console.error('Data format transition check failed:');
    errors.slice(0, 40).forEach(error => console.error(`- ${error}`));
    if (errors.length > 40) {
      console.error(`- ...and ${errors.length - 40} more`);
    }
    process.exit(1);
  }

  console.log('Data format transition check passed.');
  console.log(`Legacy: ${legacy.rows.length} tournament rows, ${legacyStats.nightCount} nights, version ${legacy.versionNumber}`);
  console.log(`V2: ${v2.rows.length} tournament rows, ${v2Stats.nightCount} nights, version ${v2.versionNumber}`);
  console.log(`Top bracelets: ${summarizeTop(v2Stats, 'bracelets')}`);
  console.log(`Top majors: ${summarizeTop(v2Stats, 'majorBracelets')}`);
}

main();
