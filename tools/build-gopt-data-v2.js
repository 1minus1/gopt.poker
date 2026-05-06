#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HISTORY_PATH = path.join(ROOT, 'files', 'GOPThistory.txt');
const HOSTS_PATH = path.join(ROOT, 'files', 'hosts.csv');
const OUTPUT_PATH = path.join(ROOT, 'data', 'GOPTdatav2.csv');

const ALLOW_DATE_CONFLICTS = process.argv.includes('--allow-date-conflicts');

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function parseDate(dateText) {
  const [month, day, rawYear] = String(dateText).trim().split('/').map(part => part.trim());
  const parsedYear = Number(rawYear);
  const year = parsedYear < 100 ? 2000 + parsedYear : parsedYear;
  return new Date(year, Number(month) - 1, Number(day));
}

function formatDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

function dayOffset(dateA, dateB) {
  return Math.round((dateA - dateB) / 86400000);
}

function normalizeForComparison(name) {
  return String(name || '')
    .trim()
    .replace(/^Masta Pu\$\$y$/i, 'Masta Pussy')
    .replace(/^Mrs\. Clay Matthews$/i, 'Mrs. Clay')
    .replace(/^Mrs Clay Matthews$/i, 'Mrs. Clay');
}

function calculatePoints(pointsAtStake, isMajor, playerCount, place) {
  const base = 0.5 * playerCount - 0.5;
  let points = pointsAtStake * (playerCount - place) / base;
  if (isMajor !== 'YES') {
    points /= 2;
  }
  return Number.isFinite(points) ? points : 0;
}

function compareNightResults(a, b) {
  const roundedPointsA = parseFloat(a.points.toFixed(2));
  const roundedPointsB = parseFloat(b.points.toFixed(2));
  if (roundedPointsA !== roundedPointsB) {
    return roundedPointsB - roundedPointsA;
  }
  return a.finalPlace - b.finalPlace;
}

function readHistory() {
  const lines = fs.readFileSync(HISTORY_PATH, 'utf8').trim().split(/\r?\n/);
  const historyVersion = lines[0].trim();
  const rows = lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const finishers = cells.slice(6).filter(Boolean);
    return {
      sourceRow: index + 2,
      sourceIndex: index,
      league: cells[0],
      season: cells[1],
      timestamp: Number.parseInt(cells[2], 10),
      isMajor: String(cells[3] || '').toUpperCase(),
      majorName: String(cells[4] || '').toUpperCase() === 'NO' ? '' : cells[4],
      pointsAtStake: cells[5],
      finishers,
    };
  });

  return { historyVersion, rows };
}

function readHosts() {
  const lines = fs.readFileSync(HOSTS_PATH, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line, index) => ({ lineNumber: index + 1, cells: parseCsvLine(line) }))
    .filter(row => row.cells.some(Boolean));

  const header = lines.shift()?.cells || [];
  const rows = lines.map(row => ({
    sourceRow: row.lineNumber,
    dateText: row.cells[0],
    date: parseDate(row.cells[0]),
    season: row.cells[1],
    isMajor: row.cells[2],
    host: row.cells[3] || '',
    winner: row.cells[4] || '',
  }));

  return { header, rows };
}

function groupHistoryNights(historyRows) {
  const nights = new Map();

  historyRows.forEach(row => {
    const key = `${row.season}|${row.timestamp}`;
    if (!nights.has(key)) {
      nights.set(key, {
        season: row.season,
        timestamp: row.timestamp,
        rows: [],
        players: new Map(),
      });
    }

    const night = nights.get(key);
    night.rows.push(row);

    row.finishers.forEach((player, index) => {
      const place = index + 1;
      if (!night.players.has(player)) {
        night.players.set(player, { player, points: 0, finalPlace: place });
      }

      const result = night.players.get(player);
      result.points += calculatePoints(Number.parseFloat(row.pointsAtStake), row.isMajor, row.finishers.length, place);
      result.finalPlace = place;
    });
  });

  return Array.from(nights.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((night, index) => {
      const isMajor = night.rows.some(row => row.isMajor === 'YES') ? 'YES' : 'NO';
      const majorName = night.rows.find(row => row.isMajor === 'YES')?.majorName || '';
      const winner = Array.from(night.players.values()).sort(compareNightResults)[0]?.player || '';
      return {
        ...night,
        eventNumber: index + 1,
        sourceDate: new Date(night.timestamp * 1000),
        isMajor,
        majorName,
        winner,
      };
    });
}

function validateCorrespondence(nights, hosts) {
  const conflicts = [];
  if (nights.length !== hosts.length) {
    conflicts.push(`history has ${nights.length} nights; hosts has ${hosts.length} rows`);
  }

  nights.forEach((night, index) => {
    const host = hosts[index];
    if (!host) return;
    const hostDateIsValid = Number.isFinite(host.date.getTime());
    const offset = hostDateIsValid ? dayOffset(host.date, night.sourceDate) : null;
    const reasons = [];

    if (night.season !== host.season) {
      reasons.push(`season ${night.season} vs ${host.season}`);
    }
    if (!hostDateIsValid) {
      reasons.push(`invalid host date ${host.dateText}`);
    }
    if (hostDateIsValid && Math.abs(offset) > 2) {
      reasons.push(`date offset ${offset > 0 ? '+' : ''}${offset} days`);
    }
    if (host.winner && normalizeForComparison(host.winner) !== normalizeForComparison(night.winner)) {
      reasons.push(`winner ${night.winner} vs ${host.winner}`);
    }

    if (reasons.length) {
      conflicts.push([
        `event ${night.eventNumber}`,
        `history ${formatDate(night.sourceDate)}`,
        `host ${host.dateText}`,
        reasons.join('; '),
      ].join(' | '));
    }
  });

  return conflicts;
}

function buildRows(historyVersion, nights, hosts) {
  const maxFinishers = Math.max(...nights.flatMap(night => night.rows.map(row => row.finishers.length)));
  const finisherHeaders = Array.from({ length: maxFinishers }, (_, index) => `finisher_${index + 1}`);
  const headers = [
    'history_version',
    'league',
    'season',
    'date',
    'is_major',
    'major_name',
    'host',
    'points_at_stake',
    'tournament_number',
    'is_ordered',
    ...finisherHeaders,
  ];

  const outputRows = [headers];
  nights.forEach((night, nightIndex) => {
    const host = hosts[nightIndex];
    night.rows
      .sort((a, b) => a.sourceIndex - b.sourceIndex)
      .forEach((row, rowIndex) => {
        const output = [
          historyVersion,
          row.league,
          row.season,
          formatDate(host.date),
          row.isMajor,
          row.majorName,
          host.host,
          row.pointsAtStake,
          rowIndex + 1,
          row.finishers.length <= 1 ? 'NO' : 'YES',
          ...row.finishers,
        ];

        while (output.length < headers.length) {
          output.push('');
        }
        outputRows.push(output);
      });
  });

  return outputRows.map(row => row.map(csvEscape).join(',')).join('\n') + '\n';
}

function main() {
  const { historyVersion, rows: historyRows } = readHistory();
  const { rows: hostRows } = readHosts();
  const nights = groupHistoryNights(historyRows);
  const conflicts = validateCorrespondence(nights, hostRows);

  if (conflicts.length && !ALLOW_DATE_CONFLICTS) {
    console.error('Stopped because history/host correspondence has conflicts:');
    conflicts.forEach(conflict => console.error(`- ${conflict}`));
    console.error('Rerun with --allow-date-conflicts after review to generate anyway.');
    process.exit(1);
  }

  if (conflicts.length) {
    console.warn('Generating despite reviewed conflicts:');
    conflicts.forEach(conflict => console.warn(`- ${conflict}`));
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, buildRows(historyVersion, nights, hostRows));
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`History rows: ${historyRows.length}`);
  console.log(`Nights: ${nights.length}`);
  console.log(`Host rows: ${hostRows.length}`);
}

main();
