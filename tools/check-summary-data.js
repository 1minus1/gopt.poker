#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const GoptData = require('../gopt-data.js');

const ROOT = path.resolve(__dirname, '..');
const V2_PATH = path.join(ROOT, 'data', 'GOPTdatav2.csv');

function readParsed(filePath) {
  return GoptData.parseDataFile(fs.readFileSync(filePath, 'utf8'), {
    normalizePlayerName: true,
  });
}

function assert(condition, message, errors) {
  if (!condition) {
    errors.push(message);
  }
}

function buildMajorSummaryRows(nights) {
  const majorMap = new Map();

  nights
    .filter(night => night.isMajor === 'YES' && night.majorName)
    .forEach(night => {
      if (!majorMap.has(night.majorName)) {
        majorMap.set(night.majorName, {
          majorName: night.majorName,
          number: 0,
          winners: new Map(),
        });
      }

      const summary = majorMap.get(night.majorName);
      summary.number += 1;
      if (night.winner) {
        summary.winners.set(night.winner, (summary.winners.get(night.winner) || 0) + 1);
      }
    });

  return Array.from(majorMap.values()).map(summary => ({
    majorName: summary.majorName,
    number: summary.number,
    winners: Array.from(summary.winners.entries())
      .sort(([winnerA, countA], [winnerB, countB]) => {
        if (countA !== countB) return countB - countA;
        return winnerA.localeCompare(winnerB);
      })
      .slice(0, 3),
  }));
}

function buildHostingRows(nights) {
  const hostedNights = nights.filter(night => night.host);
  const hostCounts = new Map();

  hostedNights.forEach(night => {
    hostCounts.set(night.host, (hostCounts.get(night.host) || 0) + 1);
  });

  return {
    recent: nights.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 10),
    hostCounts: Array.from(hostCounts.entries()),
  };
}

function buildAttendanceRows(nights) {
  const attendance = new Map();

  nights.forEach(night => {
    night.players.forEach((playerResult, player) => {
      if (!attendance.has(player)) {
        attendance.set(player, { player, nights: 0, majors: 0 });
      }
      const row = attendance.get(player);
      row.nights += 1;
      if (night.isMajor === 'YES') {
        row.majors += 1;
      }
    });
  });

  return Array.from(attendance.values());
}

function checkParsedData(label, parsed, options = {}) {
  const errors = [];
  const nights = GoptData.buildNights(parsed.rows);
  const stats = GoptData.calculateStats(parsed.rows);
  const playerNames = Object.keys(stats.allTime);
  const majorRows = buildMajorSummaryRows(nights);
  const hostingRows = buildHostingRows(nights);
  const attendanceRows = buildAttendanceRows(nights);
  const majorNamesWithYears = majorRows
    .map(row => row.majorName)
    .filter(name => /\b(?:19|20)\d{2}\b/.test(name));

  assert(nights.length > 0, `${label}: no nights were built.`, errors);
  assert(playerNames.length > 0, `${label}: point standings would be empty.`, errors);
  assert(new Set(playerNames).size === playerNames.length, `${label}: duplicate all-time player keys.`, errors);
  assert(majorRows.length > 0, `${label}: major summary would be empty.`, errors);
  assert(!majorNamesWithYears.length, `${label}: major names still include years: ${majorNamesWithYears.join(', ')}.`, errors);
  assert(majorRows.every(row => row.number > 0 && row.winners.length > 0), `${label}: major summary has empty rows.`, errors);
  assert(attendanceRows.length > 0, `${label}: attendance summary would be empty.`, errors);
  assert(attendanceRows.every(row => row.nights >= row.majors), `${label}: attendance row has more majors than nights.`, errors);

  if (options.expectHosts) {
    assert(hostingRows.hostCounts.length > 0, `${label}: hosting counts would be empty.`, errors);
    assert(nights.some(night => night.host), `${label}: no hosts are present in night data.`, errors);
  }

  return {
    errors,
    summary: {
      label,
      format: parsed.format,
      rows: parsed.rows.length,
      nights: nights.length,
      playerRows: playerNames.length,
      majorRows: majorRows.length,
      hostedNights: nights.filter(night => night.host).length,
      attendanceRows: attendanceRows.length,
    },
  };
}

function main() {
  const checks = [
    checkParsedData('GOPTdatav2.csv', readParsed(V2_PATH), { expectHosts: true }),
  ];
  const errors = checks.flatMap(check => check.errors);

  if (errors.length) {
    console.error('Summary data check failed:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log('Summary data check passed.');
  checks.forEach(check => {
    const summary = check.summary;
    console.log(
      `${summary.label}: ${summary.nights} nights, ${summary.playerRows} player rows, ` +
      `${summary.majorRows} major rows, ${summary.hostedNights} hosted nights, ` +
      `${summary.attendanceRows} attendance rows`
    );
  });
}

main();
