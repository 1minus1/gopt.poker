(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GoptData = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_FINISHER_COLUMN_COUNT = 20;
  const MS_PER_DAY = 86400000;

  function normalizeLineEndings(text) {
    return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;
    const source = normalizeLineEndings(text).replace(/^\uFEFF/, '');

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      const next = source[index + 1];

      if (char === '"' && inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(cell.trim());
        cell = '';
      } else if (char === '\n' && !inQuotes) {
        row.push(cell.trim());
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += char;
      }
    }

    if (cell || row.length) {
      row.push(cell.trim());
      rows.push(row);
    }

    return rows.filter(csvRow => csvRow.some(value => value !== ''));
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function serializeCsv(rows) {
    return rows.map(row => row.map(csvEscape).join(',')).join('\n') + '\n';
  }

  function looksLikeLegacyHistory(text) {
    const firstLine = normalizeLineEndings(text).trimStart().split('\n')[0] || '';
    return /^\d+$/.test(firstLine.trim());
  }

  function looksLikeDataV2(text) {
    const firstRow = parseCsv(text)[0] || [];
    return String(firstRow[0] || '').replace(/^\uFEFF/, '').toLowerCase() === 'history_version';
  }

  function looksLikeSupportedDataFile(text) {
    return looksLikeDataV2(text) || looksLikeLegacyHistory(text);
  }

  function parseUsDate(dateText) {
    const match = String(dateText || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!match) return null;

    const month = Number(match[1]);
    const day = Number(match[2]);
    const rawYear = Number(match[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return date;
  }

  function formatUsDateFromDate(date) {
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  }

  function formatUsDateFromTimestamp(timestamp) {
    return formatUsDateFromDate(new Date(Number(timestamp) * 1000));
  }

  function timestampFromUsDate(dateText) {
    const date = parseUsDate(dateText);
    return date ? Math.floor(date.getTime() / 1000) : NaN;
  }

  function localDateKeyFromTimestamp(timestamp) {
    const date = new Date(Number(timestamp) * 1000);
    if (Number.isNaN(date.getTime())) return '';
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  function normalizePlayerNameForDisplay(value) {
    const player = String(value || '').trim();
    return player === 'Mrs. Clay Matthews' ? 'Mrs. Clay' : player;
  }

  function cleanName(value, options = {}) {
    const player = String(value || '').trim();
    return options.normalizePlayerName ? normalizePlayerNameForDisplay(player) : player;
  }

  function normalizeMajorName(value, isMajor) {
    const majorName = String(value || '').trim();
    if (isMajor !== 'YES') return '';
    return majorName.toUpperCase() === 'NO' ? '' : majorName;
  }

  function parseLegacyHistory(text, options = {}) {
    const lines = normalizeLineEndings(text).trim().split('\n').filter(Boolean);
    const versionNumber = Number.parseInt(lines[0] || '0', 10);
    const tournamentNumbers = new Map();

    const rows = lines.slice(1).map((line, index) => {
      const cells = parseCsv(line)[0] || [];
      const season = cells[1] || '';
      const timestamp = Number.parseInt(cells[2], 10);
      const isMajor = String(cells[3] || '').trim().toUpperCase() === 'YES' ? 'YES' : 'NO';
      const key = `${season}|${timestamp}`;
      const tournamentNumber = (tournamentNumbers.get(key) || 0) + 1;
      tournamentNumbers.set(key, tournamentNumber);
      const finishers = cells.slice(6).map(player => cleanName(player, options)).filter(Boolean);

      return {
        sourceFormat: 'legacy',
        sourceIndex: index,
        historyVersion: Number.isInteger(versionNumber) ? versionNumber : null,
        league: cells[0] || '',
        season,
        dateText: Number.isInteger(timestamp) ? formatUsDateFromTimestamp(timestamp) : '',
        timestamp,
        isMajor,
        majorName: normalizeMajorName(cells[4], isMajor),
        host: '',
        pointsAtStake: cells[5] || '',
        tournamentNumber,
        isOrdered: finishers.length <= 1 ? 'NO' : 'YES',
        finishers,
      };
    }).filter(row => row.league || row.season || row.finishers.length);

    return {
      format: 'legacy',
      versionNumber: Number.isInteger(versionNumber) ? versionNumber : null,
      rows,
    };
  }

  function parseDataV2(text, options = {}) {
    const csvRows = parseCsv(text);
    const headers = (csvRows.shift() || []).map(header => String(header || '').replace(/^\uFEFF/, '').trim());
    const headerMap = new Map(headers.map((header, index) => [header.toLowerCase(), index]));
    const finisherColumns = headers
      .map((header, index) => ({ header: header.toLowerCase(), index }))
      .filter(column => /^finisher_\d+$/.test(column.header))
      .sort((a, b) => Number(a.header.split('_')[1]) - Number(b.header.split('_')[1]));

    function cell(csvRow, name) {
      const index = headerMap.get(name);
      return index === undefined ? '' : csvRow[index] || '';
    }

    const rows = csvRows.map((csvRow, sourceIndex) => {
      const isMajor = String(cell(csvRow, 'is_major')).trim().toUpperCase() === 'YES' ? 'YES' : 'NO';
      const dateText = cell(csvRow, 'date');
      const finishers = finisherColumns
        .map(column => cleanName(csvRow[column.index], options))
        .filter(Boolean);

      return {
        sourceFormat: 'v2',
        sourceIndex,
        historyVersion: Number.parseInt(cell(csvRow, 'history_version'), 10),
        league: cell(csvRow, 'league'),
        season: cell(csvRow, 'season'),
        dateText,
        timestamp: timestampFromUsDate(dateText),
        isMajor,
        majorName: normalizeMajorName(cell(csvRow, 'major_name'), isMajor),
        host: cell(csvRow, 'host'),
        pointsAtStake: cell(csvRow, 'points_at_stake'),
        tournamentNumber: Number.parseInt(cell(csvRow, 'tournament_number'), 10) || 1,
        isOrdered: String(cell(csvRow, 'is_ordered') || (finishers.length <= 1 ? 'NO' : 'YES')).toUpperCase(),
        finishers,
      };
    }).filter(row => row.league || row.season || row.finishers.length);

    const versionNumbers = rows
      .map(row => row.historyVersion)
      .filter(Number.isInteger);

    return {
      format: 'v2',
      versionNumber: versionNumbers.length ? Math.max(...versionNumbers) : null,
      rows,
    };
  }

  function parseDataFile(text, options = {}) {
    if (looksLikeDataV2(text)) {
      return parseDataV2(text, options);
    }
    if (looksLikeLegacyHistory(text)) {
      return parseLegacyHistory(text, options);
    }
    throw new Error('Unsupported GOPT data file format.');
  }

  function calculatePoints(pointsAtStake, isMajor, playerCount, place) {
    const base = 0.5 * playerCount - 0.5;
    let points = Number(pointsAtStake) * (playerCount - place) / base;
    if (isMajor !== 'YES') {
      points /= 2;
    }
    return Number.isFinite(points) ? points : 0;
  }

  function calculateRowPoints(row, playerCount, place) {
    if (row.isOrdered === 'NO') {
      if (place !== 1) return 0;
      return row.isMajor === 'YES' ? 80 : 40;
    }

    return calculatePoints(row.pointsAtStake, row.isMajor, playerCount, place);
  }

  function compareNightResults(a, b) {
    const roundedPointsA = parseFloat(a.points.toFixed(2));
    const roundedPointsB = parseFloat(b.points.toFixed(2));
    if (roundedPointsA !== roundedPointsB) {
      return roundedPointsB - roundedPointsA;
    }
    const finalPlaceA = Number.isFinite(a.finalPlace) ? a.finalPlace : Number.POSITIVE_INFINITY;
    const finalPlaceB = Number.isFinite(b.finalPlace) ? b.finalPlace : Number.POSITIVE_INFINITY;
    return finalPlaceA - finalPlaceB;
  }

  function buildNights(rows) {
    const nights = new Map();

    rows.forEach(row => {
      const key = `${row.season}|${localDateKeyFromTimestamp(row.timestamp)}`;
      if (!row.season || !key || !row.finishers.length) return;

      if (!nights.has(key)) {
        nights.set(key, {
          key,
          season: row.season,
          dateText: row.dateText || formatUsDateFromTimestamp(row.timestamp),
          timestamp: row.timestamp,
          isMajor: row.isMajor,
          majorName: row.majorName,
          host: row.host,
          rows: [],
          players: new Map(),
        });
      }

      const night = nights.get(key);
      night.rows.push(row);
      if (row.isMajor === 'YES') {
        night.isMajor = 'YES';
        night.majorName = row.majorName;
      }
      if (row.host && !night.host) {
        night.host = row.host;
      }

      row.finishers.forEach((player, index) => {
        const place = index + 1;
        const placeLabel = row.isOrdered === 'NO' && place !== 1 ? '' : String(place);
        if (!night.players.has(player)) {
          night.players.set(player, {
            player,
            points: 0,
            places: [],
            finalPlace: placeLabel ? place : Number.POSITIVE_INFINITY,
          });
        }

        const result = night.players.get(player);
        result.points += calculateRowPoints(row, row.finishers.length, place);
        if (placeLabel) {
          result.places.push(placeLabel);
          result.finalPlace = place;
        }
      });
    });

    return Array.from(nights.values())
      .sort((a, b) => {
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        return a.season.localeCompare(b.season);
      })
      .map((night, index) => ({
        ...night,
        eventNumber: index + 1,
        winner: Array.from(night.players.values()).sort(compareNightResults)[0]?.player || '',
      }));
  }

  function calculateStats(rows) {
    const stats = {
      allTime: {},
      bySeason: {},
      nightCount: 0,
      rowCount: rows.length,
    };

    buildNights(rows).forEach(night => {
      stats.nightCount += 1;
      if (!stats.bySeason[night.season]) {
        stats.bySeason[night.season] = {};
      }

      Array.from(night.players.values()).forEach(playerResult => {
        [stats.allTime, stats.bySeason[night.season]].forEach(bucket => {
          if (!bucket[playerResult.player]) {
            bucket[playerResult.player] = { points: 0, bracelets: 0, majorBracelets: 0 };
          }
          bucket[playerResult.player].points += playerResult.points;
        });
      });

      if (night.winner) {
        [stats.allTime, stats.bySeason[night.season]].forEach(bucket => {
          if (!bucket[night.winner]) {
            bucket[night.winner] = { points: 0, bracelets: 0, majorBracelets: 0 };
          }
          bucket[night.winner].bracelets += 1;
          if (night.isMajor === 'YES') {
            bucket[night.winner].majorBracelets += 1;
          }
        });
      }
    });

    return stats;
  }

  function sortRowsChronologically(rows) {
    return [...rows].sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      if (a.season !== b.season) return String(a.season).localeCompare(String(b.season));
      return (a.tournamentNumber || 0) - (b.tournamentNumber || 0);
    });
  }

  function serializeDataV2(rows, options = {}) {
    const versionNumber = options.versionNumber;
    const maxFinishers = Math.max(
      DEFAULT_FINISHER_COLUMN_COUNT,
      ...rows.map(row => row.finishers.length)
    );
    const finisherColumnCount = Math.max(
      Number(options.finisherColumnCount) || 0,
      maxFinishers
    );
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
      ...Array.from({ length: finisherColumnCount }, (_, index) => `finisher_${index + 1}`),
    ];

    const output = [headers];
    sortRowsChronologically(rows).forEach(row => {
      const finishers = row.finishers || [];
      const csvRow = [
        versionNumber ?? row.historyVersion ?? '',
        row.league,
        row.season,
        row.dateText || formatUsDateFromTimestamp(row.timestamp),
        row.isMajor,
        row.isMajor === 'YES' ? row.majorName : '',
        row.host || '',
        row.pointsAtStake,
        row.tournamentNumber || 1,
        row.isOrdered || (finishers.length <= 1 ? 'NO' : 'YES'),
        ...finishers,
      ];

      while (csvRow.length < headers.length) {
        csvRow.push('');
      }
      output.push(csvRow.slice(0, headers.length));
    });

    return serializeCsv(output);
  }

  return {
    DEFAULT_FINISHER_COLUMN_COUNT,
    buildNights,
    calculatePoints,
    calculateStats,
    compareNightResults,
    formatUsDateFromTimestamp,
    localDateKeyFromTimestamp,
    looksLikeDataV2,
    looksLikeLegacyHistory,
    looksLikeSupportedDataFile,
    normalizePlayerNameForDisplay,
    parseCsv,
    parseDataFile,
    parseUsDate,
    serializeDataV2,
    timestampFromUsDate,
  };
}));
