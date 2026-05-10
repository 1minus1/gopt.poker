const state = {
  allPlayers: [],
  currentSeasonPlayers: [],
  details: null,
  draftActive: false,
  downloadUrl: null,
  generatedText: '',
  headerLine: '',
  hosts: [],
  dataRows: [],
  majorNames: [],
  maxHistoryVersion: null,
  selectedPlayers: new Set(),
  seasons: [],
  tournamentCountTouched: false,
  tournaments: [],
};

const DRAFT_STORAGE_KEY = 'gopt.recordDraft.v1';

const els = {
  addPlayer: document.getElementById('add-player'),
  buyIn: document.getElementById('buy-in'),
  clearPlayers: document.getElementById('clear-players'),
  downloadHistory: document.getElementById('download-history'),
  editDetails: document.getElementById('edit-details'),
  finishNight: document.getElementById('finish-night'),
  finishStatus: document.getElementById('finish-status'),
  generatedSection: document.getElementById('generated-section'),
  historyPreview: document.getElementById('history-preview'),
  hostSelect: document.getElementById('host-select'),
  lockedSummary: document.getElementById('locked-summary'),
  majorNameField: document.getElementById('major-name-field'),
  majorNameSelect: document.getElementById('major-name-select'),
  majorSelect: document.getElementById('major-select'),
  newHostField: document.getElementById('new-host-field'),
  newHostInput: document.getElementById('new-host-input'),
  newMajorNameField: document.getElementById('new-major-name-field'),
  newMajorNameInput: document.getElementById('new-major-name-input'),
  message: document.getElementById('record-message'),
  newPlayerInput: document.getElementById('new-player-input'),
  newSeasonField: document.getElementById('new-season-field'),
  newSeasonInput: document.getElementById('new-season-input'),
  nightDatetime: document.getElementById('night-datetime'),
  playerList: document.getElementById('player-list'),
  rankingSection: document.getElementById('ranking-section'),
  replaceForm: document.getElementById('replace-form'),
  replacePassword: document.getElementById('replace-password'),
  replaceUsername: document.getElementById('replace-username'),
  seasonSelect: document.getElementById('season-select'),
  setupForm: document.getElementById('setup-form'),
  setupSection: document.getElementById('setup-section'),
  tournamentCount: document.getElementById('tournament-count'),
  tournamentPanels: document.getElementById('tournament-panels'),
  unlockResults: document.getElementById('unlock-results'),
};

let dragState = null;

function showMessage(message, type = 'success') {
  els.message.className = `admin-message is-${type}`;
  els.message.textContent = message;
}

function clearMessage() {
  els.message.className = 'admin-message';
  els.message.textContent = '';
}

function getSetupDraft() {
  return {
    buyIn: els.buyIn.value,
    hostSelect: els.hostSelect.value,
    majorSelect: els.majorSelect.value,
    majorNameSelect: els.majorNameSelect.value,
    newHost: els.newHostInput.value,
    newMajorName: els.newMajorNameInput.value,
    newPlayerInput: els.newPlayerInput.value,
    newSeason: els.newSeasonInput.value,
    nightDatetime: els.nightDatetime.value,
    seasonSelect: els.seasonSelect.value,
    selectedPlayers: Array.from(state.selectedPlayers),
    tournamentCount: els.tournamentCount.value,
    tournamentCountTouched: state.tournamentCountTouched,
  };
}

function getRecordScreen() {
  if (!els.generatedSection.hidden) return 'generated';
  if (!els.rankingSection.hidden) return 'ranking';
  return 'setup';
}

function saveDraft() {
  if (els.message.querySelector('.draft-message-actions')) {
    clearMessage();
  }

  const draft = {
    allPlayers: state.allPlayers,
    details: state.details,
    generatedText: state.generatedText,
    headerLine: state.headerLine,
    maxHistoryVersion: state.maxHistoryVersion,
    savedAt: new Date().toISOString(),
    screen: getRecordScreen(),
    setup: getSetupDraft(),
    tournaments: state.tournaments,
    version: 1,
  };

  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    state.draftActive = true;
  } catch {
    showMessage('Draft autosave is not available in this browser.', 'error');
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSavedDraft() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Local draft cleanup is best-effort.
  }
  state.draftActive = false;
}

function getMostRecentSeason() {
  return state.seasons[0]?.season || String(new Date().getFullYear());
}

function cleanTextField(value) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeMajorName(value) {
  return GoptData.normalizeMajorName(cleanTextField(value), 'YES');
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureNoComma(value, label) {
  if (value.includes(',')) {
    throw new Error(`${label} cannot contain commas yet.`);
  }
}

function formatNumber(value) {
  return String(Number(value).toFixed(2)).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function localDateTimeValue(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function localCalendarDateKey(timestamp) {
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return '';

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatCalendarDate(timestamp) {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function findHistoryRowOnCalendarDate(timestamp) {
  const dateKey = localCalendarDateKey(timestamp);
  if (!dateKey) return null;

  for (const row of state.dataRows) {
    if (Number.isFinite(row.timestamp) && localCalendarDateKey(row.timestamp) === dateKey) {
      return {
        isMajor: row.isMajor === 'YES',
        majorName: row.majorName || '',
        season: row.season || '',
        timestamp: row.timestamp,
      };
    }
  }

  return null;
}

function parseCurrentData(data) {
  const parsedData = GoptData.parseDataFile(data);
  state.headerLine = String(parsedData.versionNumber || '1');
  const currentVersion = Number.parseInt(state.headerLine, 10);
  if (Number.isInteger(currentVersion)) {
    state.maxHistoryVersion = Math.max(state.maxHistoryVersion || currentVersion, currentVersion);
  }
  state.dataRows = parsedData.rows;

  const seasonDates = new Map();
  const hosts = new Set();
  const majorNames = new Set();
  const players = new Set();
  state.dataRows.forEach(row => {
    const season = row.season;
    const timestamp = row.timestamp;

    if (season && Number.isFinite(timestamp)) {
      seasonDates.set(season, Math.max(seasonDates.get(season) || 0, timestamp));
    }

    if (row.host) {
      hosts.add(row.host);
    }
    if (row.isMajor === 'YES' && row.majorName) {
      majorNames.add(row.majorName);
    }
    row.finishers.forEach(player => {
      if (player) players.add(player);
    });
  });

  state.seasons = Array.from(seasonDates.entries())
    .map(([season, timestamp]) => ({ season, timestamp }))
    .sort((a, b) => b.timestamp - a.timestamp);

  const latestSeason = getMostRecentSeason();
  const currentPlayers = new Set();
  state.dataRows.forEach(row => {
    if (row.season === latestSeason) {
      row.finishers.forEach(player => {
        if (player) currentPlayers.add(player);
      });
    }
  });

  state.allPlayers = Array.from(players).sort((a, b) => a.localeCompare(b));
  state.currentSeasonPlayers = Array.from(currentPlayers).sort((a, b) => a.localeCompare(b));
  state.hosts = Array.from(hosts).sort((a, b) => a.localeCompare(b));
  state.majorNames = Array.from(majorNames).sort((a, b) => a.localeCompare(b));
}

function renderSeasonOptions() {
  els.seasonSelect.innerHTML = '';

  state.seasons.forEach(({ season }) => {
    const option = document.createElement('option');
    option.value = season;
    option.textContent = season;
    els.seasonSelect.appendChild(option);
  });

  const newOption = document.createElement('option');
  newOption.value = '__new__';
  newOption.textContent = 'New season...';
  els.seasonSelect.appendChild(newOption);
}

function renderHostOptions() {
  els.hostSelect.innerHTML = '';

  state.hosts.forEach(host => {
    const option = document.createElement('option');
    option.value = host;
    option.textContent = host;
    els.hostSelect.appendChild(option);
  });

  const newOption = document.createElement('option');
  newOption.value = '__new__';
  newOption.textContent = 'New host...';
  els.hostSelect.appendChild(newOption);
}

function renderMajorNameOptions() {
  els.majorNameSelect.innerHTML = '';

  state.majorNames.forEach(majorName => {
    const option = document.createElement('option');
    option.value = majorName;
    option.textContent = majorName;
    els.majorNameSelect.appendChild(option);
  });

  const newOption = document.createElement('option');
  newOption.value = '__new__';
  newOption.textContent = 'New major...';
  els.majorNameSelect.appendChild(newOption);
}

function renderPlayers() {
  els.playerList.innerHTML = '';

  state.allPlayers.forEach(player => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = player;
    checkbox.checked = state.selectedPlayers.has(player);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        state.selectedPlayers.add(player);
      } else {
        state.selectedPlayers.delete(player);
      }
      saveDraft();
    });

    const name = document.createElement('span');
    name.textContent = player;

    label.append(checkbox, name);
    els.playerList.appendChild(label);
  });
}

function updateSeasonFields() {
  const isNew = els.seasonSelect.value === '__new__';
  els.newSeasonField.hidden = !isNew;
  els.newSeasonInput.required = isNew;
  els.newSeasonInput.disabled = !isNew;
}

function updateHostFields() {
  const isNew = els.hostSelect.value === '__new__';
  els.newHostField.hidden = !isNew;
  els.newHostInput.required = isNew;
  els.newHostInput.disabled = !isNew;
}

function updateMajorFields() {
  const isMajor = els.majorSelect.value === 'YES';
  const isNewMajor = isMajor && els.majorNameSelect.value === '__new__';
  els.majorNameField.hidden = !isMajor;
  els.majorNameSelect.required = isMajor;
  els.majorNameSelect.disabled = !isMajor;
  els.newMajorNameField.hidden = !isNewMajor;
  els.newMajorNameInput.required = isNewMajor;
  els.newMajorNameInput.disabled = !isNewMajor;

  if (!state.tournamentCountTouched) {
    const defaultCount = isMajor ? '1' : '2';
    els.tournamentCount.value = defaultCount;
    els.tournamentCount.setAttribute('value', defaultCount);
  }
}

function updateLockedSummary() {
  const type = state.details.isMajor ? `Major: ${state.details.majorName}` : 'Standard night';
  const date = new Date(state.details.timestamp * 1000).toLocaleString();
  els.lockedSummary.textContent = `${state.details.season} | ${type} | hosted by ${state.details.host} | ${state.details.tournamentCount} tournament(s) | ${state.details.roster.length} players | ${date}`;
}

function addPlayer(name) {
  const player = cleanTextField(name);
  if (!player) return;
  ensureNoComma(player, 'Player names');

  if (!state.allPlayers.includes(player)) {
    state.allPlayers.push(player);
    state.allPlayers.sort((a, b) => a.localeCompare(b));
  }

  state.selectedPlayers.add(player);
  renderPlayers();
}

function getSelectedSeason() {
  if (els.seasonSelect.value === '__new__') {
    const season = cleanTextField(els.newSeasonInput.value);
    ensureNoComma(season, 'Season');
    return season;
  }

  return els.seasonSelect.value;
}

function getSelectedHost() {
  if (els.hostSelect.value === '__new__') {
    const host = cleanTextField(els.newHostInput.value);
    ensureNoComma(host, 'Host');
    return host;
  }

  return els.hostSelect.value;
}

function getSelectedMajorName(isMajor) {
  if (!isMajor) return '';

  const rawMajorName = els.majorNameSelect.value === '__new__'
    ? els.newMajorNameInput.value
    : els.majorNameSelect.value;
  const majorName = normalizeMajorName(rawMajorName);
  ensureNoComma(majorName, 'Major name');
  return majorName;
}

function getSetupDetails() {
  const season = getSelectedSeason();
  const host = getSelectedHost();
  const isMajor = els.majorSelect.value === 'YES';
  const majorName = getSelectedMajorName(isMajor);
  const tournamentCount = Number(els.tournamentCount.value);
  const buyIn = Number(els.buyIn.value);
  const timestamp = Math.floor(new Date(els.nightDatetime.value).getTime() / 1000);
  const roster = Array.from(state.selectedPlayers).sort((a, b) => a.localeCompare(b));

  if (!season) throw new Error('Choose or enter a season.');
  if (!host) throw new Error('Choose or enter a host.');
  if (isMajor && !majorName) throw new Error('Name the major.');
  if (!Number.isInteger(tournamentCount) || tournamentCount < 1) throw new Error('Tournament count must be at least 1.');
  if (!Number.isFinite(buyIn) || buyIn <= 0) throw new Error('Buy-in must be greater than 0.');
  if (!Number.isInteger(timestamp) || timestamp <= 0) throw new Error('Choose a valid night date/time.');
  if (roster.length < 2) throw new Error('Select at least two players.');

  roster.forEach(player => ensureNoComma(player, 'Player names'));

  const existingNight = findHistoryRowOnCalendarDate(timestamp);
  if (existingNight) {
    const existingType = existingNight.isMajor
      ? `major "${existingNight.majorName}"`
      : 'standard night';
    throw new Error(`The active data already has a ${existingType} on ${formatCalendarDate(existingNight.timestamp)}. Choose a different event date before locking details.`);
  }

  return {
    buyIn,
    host,
    isMajor,
    league: 'GOPT',
    majorName,
    pointsAtStake: buyIn * (isMajor ? 2 : 1),
    roster,
    season,
    timestamp,
    tournamentCount,
  };
}

function lockDetails(details) {
  state.details = details;
  state.tournaments = Array.from({ length: details.tournamentCount }, () => ({ outOrder: [] }));

  els.setupSection.hidden = true;
  els.rankingSection.hidden = false;
  els.generatedSection.hidden = true;
  clearGeneratedFile();

  updateLockedSummary();
  renderTournaments();
  updateFinishState();
  saveDraft();
}

function ordinal(value) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const mod100 = value % 100;
  return `${value}${suffixes[(mod100 - 20) % 10] || suffixes[mod100] || suffixes[0]}`;
}

function finishLabel(outIndex, playerCount) {
  const place = playerCount - outIndex;
  return place === 1 ? 'Winner' : `${ordinal(place)} place`;
}

function getDisplayOrder(tournament) {
  return [...tournament.outOrder].reverse();
}

function renderTournaments() {
  els.tournamentPanels.innerHTML = '';

  state.tournaments.forEach((tournament, tournamentIndex) => {
    const panel = document.createElement('section');
    panel.className = 'tournament-panel';
    panel.dataset.tournamentIndex = String(tournamentIndex);

    const available = state.details.roster.filter(player => !tournament.outOrder.includes(player));

    panel.innerHTML = `
      <h3>Tournament ${tournamentIndex + 1}</h3>
      <p class="muted">${tournament.outOrder.length} of ${state.details.roster.length} players placed</p>
      <div class="available-players" data-available></div>
      <ol class="rank-list" data-rank-list data-tournament-index="${tournamentIndex}" aria-label="Tournament ${tournamentIndex + 1} final standings"></ol>
    `;

    const availableEl = panel.querySelector('[data-available]');
    available.forEach(player => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.addPlayer = player;
      button.textContent = player;
      availableEl.appendChild(button);
    });

    if (!available.length) {
      const complete = document.createElement('span');
      complete.className = 'muted';
      complete.textContent = 'All players placed.';
      availableEl.appendChild(complete);
    }

    const list = panel.querySelector('[data-rank-list]');
    const displayOrder = getDisplayOrder(tournament);
    displayOrder.forEach((player, displayIndex) => {
      const outIndex = tournament.outOrder.indexOf(player);
      const item = document.createElement('li');
      item.className = 'rank-item';
      item.draggable = true;
      item.dataset.displayIndex = String(displayIndex);
      item.dataset.orderIndex = String(outIndex);
      item.dataset.tournamentIndex = String(tournamentIndex);
      item.innerHTML = `
        <span class="drag-handle" aria-hidden="true">::</span>
        <span class="rank-name">
          ${escapeHtml(player)}
          <span class="rank-place">${finishLabel(outIndex, state.details.roster.length)}</span>
        </span>
        <button type="button" data-move-up ${displayIndex === 0 ? 'disabled' : ''}>Up</button>
        <button type="button" data-move-down ${displayIndex === displayOrder.length - 1 ? 'disabled' : ''}>Down</button>
        <button type="button" data-remove-player="${escapeHtml(player)}">Remove</button>
      `;
      list.appendChild(item);
    });

    els.tournamentPanels.appendChild(panel);
  });
}

function placePlayer(tournamentIndex, player) {
  const tournament = state.tournaments[tournamentIndex];
  if (!tournament || tournament.outOrder.includes(player)) return;
  tournament.outOrder.push(player);
  renderTournaments();
  updateFinishState();
  saveDraft();
}

function removePlayer(tournamentIndex, player) {
  const tournament = state.tournaments[tournamentIndex];
  if (!tournament) return;
  tournament.outOrder = tournament.outOrder.filter(candidate => candidate !== player);
  renderTournaments();
  updateFinishState();
  saveDraft();
}

function movePlayerByDisplayIndex(tournamentIndex, fromDisplayIndex, toDisplayIndex) {
  const tournament = state.tournaments[tournamentIndex];
  if (!tournament) return;

  const displayOrder = getDisplayOrder(tournament);
  const boundedTo = Math.max(0, Math.min(toDisplayIndex, displayOrder.length - 1));
  if (fromDisplayIndex === boundedTo) return;

  const [player] = displayOrder.splice(fromDisplayIndex, 1);
  displayOrder.splice(boundedTo, 0, player);
  tournament.outOrder = displayOrder.reverse();
  renderTournaments();
  updateFinishState();
  saveDraft();
}

function allTournamentsComplete() {
  const tournamentCount = Number(state.details?.tournamentCount);
  if (!state.details || !Number.isInteger(tournamentCount) || state.tournaments.length !== tournamentCount) return false;

  const roster = state.details.roster;
  return state.tournaments.every(tournament =>
    tournament.outOrder.length === roster.length &&
    roster.every(player => tournament.outOrder.includes(player))
  );
}

function updateFinishState() {
  if (!state.details) return;

  const tournamentCount = Number(state.details.tournamentCount);
  const incomplete = Array.from({ length: tournamentCount }, (_, index) => {
    const tournament = state.tournaments[index] || { outOrder: [] };
    return {
      index: index + 1,
      remaining: Math.max(0, state.details.roster.length - tournament.outOrder.length),
    };
  })
    .filter(tournament => tournament.remaining > 0);

  els.finishNight.disabled = !allTournamentsComplete();
  els.finishStatus.textContent = incomplete.length
    ? incomplete.map(tournament => `Tournament ${tournament.index}: ${tournament.remaining} remaining`).join(' | ')
    : 'All tournaments are complete.';
}

function buildDataV2Text() {
  const details = state.details;
  const isMajor = details.isMajor ? 'YES' : 'NO';
  const majorName = details.isMajor ? normalizeMajorName(details.majorName) : '';
  const pointsAtStake = formatNumber(details.pointsAtStake);
  const serverVersion = Number.parseInt(state.headerLine, 10);
  const baselineVersion = Number.isInteger(state.maxHistoryVersion)
    ? state.maxHistoryVersion
    : serverVersion;
  const nextVersion = Number.isInteger(baselineVersion) ? baselineVersion + 1 : Number(state.headerLine) || 1;
  const dateText = GoptData.formatUsDateFromTimestamp(details.timestamp);

  const newRows = state.tournaments.map((tournament, tournamentIndex) => {
    const finishOrder = [...tournament.outOrder].reverse();
    return {
      historyVersion: nextVersion,
      league: details.league,
      season: details.season,
      dateText,
      timestamp: details.timestamp,
      isMajor,
      majorName,
      host: details.host,
      pointsAtStake,
      tournamentNumber: tournamentIndex + 1,
      isOrdered: 'YES',
      finishers: finishOrder,
    };
  });

  const existingRows = state.dataRows.map(row => ({
    ...row,
    historyVersion: nextVersion,
  }));

  return GoptData.serializeDataV2(
    [
      ...existingRows,
      ...newRows,
    ],
    {
      versionNumber: nextVersion,
    }
  );
}

function clearGeneratedFile() {
  if (state.downloadUrl) {
    URL.revokeObjectURL(state.downloadUrl);
  }
  state.downloadUrl = null;
  state.generatedText = '';
  els.historyPreview.value = '';
  els.downloadHistory.removeAttribute('href');
}

function setGeneratedFile(text) {
  clearGeneratedFile();
  state.generatedText = text;
  state.downloadUrl = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  els.downloadHistory.href = state.downloadUrl;
  els.historyPreview.value = text;
  els.generatedSection.hidden = false;
  els.downloadHistory.focus();
}

function setSeasonSelectValue(value) {
  if (!value) return;

  if (!Array.from(els.seasonSelect.options).some(option => option.value === value)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    els.seasonSelect.insertBefore(option, els.seasonSelect.querySelector('option[value="__new__"]'));
  }

  els.seasonSelect.value = value;
}

function setHostSelectValue(value) {
  if (!value) return;

  if (!Array.from(els.hostSelect.options).some(option => option.value === value)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    els.hostSelect.insertBefore(option, els.hostSelect.querySelector('option[value="__new__"]'));
  }

  els.hostSelect.value = value;
}

function setMajorNameSelectValue(value) {
  if (!value) return;

  const normalized = normalizeMajorName(value);
  if (!Array.from(els.majorNameSelect.options).some(option => option.value === normalized)) {
    const option = document.createElement('option');
    option.value = normalized;
    option.textContent = normalized;
    els.majorNameSelect.insertBefore(option, els.majorNameSelect.querySelector('option[value="__new__"]'));
  }

  els.majorNameSelect.value = normalized;
}

function normalizeRestoredTournaments(tournaments, details) {
  const source = Array.isArray(tournaments) ? tournaments : [];
  const tournamentCount = Number(details?.tournamentCount);
  const normalizedCount = Number.isInteger(tournamentCount) && tournamentCount > 0
    ? tournamentCount
    : 0;
  const roster = Array.isArray(details?.roster) ? details.roster : [];
  const rosterSet = new Set(roster);

  return Array.from({ length: normalizedCount }, (_, index) => {
    const restoredOrder = Array.isArray(source[index]?.outOrder) ? source[index].outOrder : [];
    const outOrder = [];
    restoredOrder.forEach(player => {
      if (rosterSet.has(player) && !outOrder.includes(player)) {
        outOrder.push(player);
      }
    });
    return { outOrder };
  });
}

function restoreDraft(draft) {
  const setup = draft.setup || {};
  const players = new Set([...state.allPlayers, ...(draft.allPlayers || []), ...(setup.selectedPlayers || [])]);
  state.allPlayers = Array.from(players).sort((a, b) => a.localeCompare(b));
  state.selectedPlayers = new Set(setup.selectedPlayers || []);
  state.tournamentCountTouched = Boolean(setup.tournamentCountTouched);
  if (Number.isInteger(Number(draft.maxHistoryVersion))) {
    state.maxHistoryVersion = Math.max(state.maxHistoryVersion || 0, Number(draft.maxHistoryVersion));
  }

  renderPlayers();
  setSeasonSelectValue(setup.seasonSelect);
  setHostSelectValue(setup.hostSelect);
  els.newSeasonInput.value = setup.newSeason || '';
  els.newHostInput.value = setup.newHost || '';
  els.nightDatetime.value = setup.nightDatetime || els.nightDatetime.value;
  els.majorSelect.value = setup.majorSelect || 'NO';
  setMajorNameSelectValue(setup.majorNameSelect || setup.majorName);
  els.newMajorNameInput.value = setup.newMajorName || '';
  els.newPlayerInput.value = setup.newPlayerInput || '';
  els.buyIn.value = setup.buyIn || '20';
  els.tournamentCount.value = setup.tournamentCount || els.tournamentCount.value;
  updateSeasonFields();
  updateHostFields();
  updateMajorFields();
  els.tournamentCount.value = setup.tournamentCount || els.tournamentCount.value;

  state.details = draft.details || null;
  state.tournaments = state.details
    ? normalizeRestoredTournaments(draft.tournaments, state.details)
    : [];

  if (state.details) {
    els.setupSection.hidden = true;
    els.rankingSection.hidden = false;
    els.generatedSection.hidden = true;
    updateLockedSummary();
    renderTournaments();
    updateFinishState();
  } else {
    els.setupSection.hidden = false;
    els.rankingSection.hidden = true;
    els.generatedSection.hidden = true;
    clearGeneratedFile();
  }

  if (draft.generatedText && draft.headerLine === state.headerLine) {
    setGeneratedFile(draft.generatedText);
  }

  saveDraft();
  showMessage(`Draft resumed from ${new Date(draft.savedAt).toLocaleString()}.`, 'success');
}

function showDraftRestorePrompt(draft) {
  if (!draft || draft.version !== 1 || !draft.savedAt) return;

  els.message.className = 'admin-message is-success';
  els.message.innerHTML = '';

  const text = document.createElement('span');
  text.textContent = `Saved Record draft from ${new Date(draft.savedAt).toLocaleString()}.`;

  const actions = document.createElement('span');
  actions.className = 'draft-message-actions';

  const resume = document.createElement('button');
  resume.type = 'button';
  resume.textContent = 'Resume Draft';
  resume.addEventListener('click', () => restoreDraft(draft));

  const discard = document.createElement('button');
  discard.type = 'button';
  discard.textContent = 'Discard Draft';
  discard.addEventListener('click', () => {
    clearSavedDraft();
    clearMessage();
  });

  actions.append(resume, discard);
  els.message.append(text, actions);
}

function downloadGeneratedFile() {
  if (state.downloadUrl) {
    els.downloadHistory.click();
  }
}

async function createServerHistoryVersion(event) {
  event.preventDefault();
  clearMessage();

  if (!state.generatedText) {
    showMessage('Finish the night before creating a server data version.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('username', els.replaceUsername.value);
  formData.append('password', els.replacePassword.value);
  formData.append('source', 'recorded-night');
  formData.append('label', 'Created from Record page');
  formData.append('historyFile', new File([state.generatedText], 'GOPTdatav2.csv', { type: 'text/csv' }));

  const { response, result } = await fetchUploadResult(formData);

  if (!response.ok || result.status !== 'success') {
    showMessage(result.message || 'Server data update failed.', 'error');
    return;
  }

  const createdVersion = Number.parseInt(result.versionNumber, 10);
  if (Number.isInteger(createdVersion)) {
    state.maxHistoryVersion = Math.max(state.maxHistoryVersion || createdVersion, createdVersion);
  }
  parseCurrentData(state.generatedText);
  clearSavedDraft();
  showMessage(`Current server data updated to version ${result.versionNumber}. The recorder is now using that version as its baseline.`, 'success');
}

async function fetchUploadResult(formData, endpoints = ['upload-history', 'api/history-upload.php']) {
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
      });
      const result = await response.json();
      return { response, result };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Server data update failed.');
}

async function fetchCurrentDataText(sources = ['api/history/current', 'api/history-current.php', 'data/GOPTdatav2.csv']) {
  let lastError = null;

  for (const source of sources) {
    try {
      const response = await fetch(source, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not load ${source}.`);

      const text = await response.text();
      if (!GoptData.looksLikeSupportedDataFile(text)) {
        throw new Error(`${source} did not return a supported GOPT data file.`);
      }

      return text;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Could not load current data.');
}

async function refreshMaxHistoryVersion() {
  let versionNumbers = [];

  try {
    const data = await fetchJson(['api/history/versions', 'api/history-versions.php']);
    versionNumbers = Array.isArray(data.versions)
      ? data.versions
          .map(version => Number.parseInt(version.versionNumber, 10))
          .filter(Number.isInteger)
      : [];
  } catch {
    versionNumbers = [];
  }

  const currentVersion = Number.parseInt(state.headerLine, 10);
  if (Number.isInteger(currentVersion)) {
    versionNumbers.push(currentVersion);
  }
  if (!versionNumbers.length) {
    throw new Error('Could not determine the latest data version number.');
  }

  state.maxHistoryVersion = Math.max(...versionNumbers);
}

async function fetchJson(endpoints) {
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not load ${endpoint}.`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Could not load JSON from the server.');
}

async function loadHistory() {
  const text = await fetchCurrentDataText();
  parseCurrentData(text);
  await refreshMaxHistoryVersion();
  renderSeasonOptions();
  renderHostOptions();
  renderMajorNameOptions();
  renderPlayers();
  updateSeasonFields();
  updateHostFields();
  updateMajorFields();
  els.nightDatetime.value = localDateTimeValue();
  showDraftRestorePrompt(loadDraft());
}

els.seasonSelect.addEventListener('change', () => {
  updateSeasonFields();
  saveDraft();
});
els.newSeasonInput.addEventListener('input', saveDraft);
els.hostSelect.addEventListener('change', () => {
  updateHostFields();
  saveDraft();
});
els.newHostInput.addEventListener('input', saveDraft);
els.nightDatetime.addEventListener('input', saveDraft);
els.majorSelect.addEventListener('change', () => {
  updateMajorFields();
  saveDraft();
});
els.majorNameSelect.addEventListener('change', () => {
  updateMajorFields();
  saveDraft();
});
els.newMajorNameInput.addEventListener('input', saveDraft);
els.buyIn.addEventListener('input', () => {
  saveDraft();
});
els.tournamentCount.addEventListener('input', () => {
  state.tournamentCountTouched = true;
  saveDraft();
});

els.addPlayer.addEventListener('click', () => {
  try {
    addPlayer(els.newPlayerInput.value);
    els.newPlayerInput.value = '';
    saveDraft();
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

els.newPlayerInput.addEventListener('input', saveDraft);
els.newPlayerInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    els.addPlayer.click();
  }
});

els.clearPlayers.addEventListener('click', () => {
  state.selectedPlayers.clear();
  renderPlayers();
  saveDraft();
});

els.setupForm.addEventListener('submit', event => {
  event.preventDefault();
  clearMessage();

  try {
    lockDetails(getSetupDetails());
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

els.editDetails.addEventListener('click', () => {
  els.setupSection.hidden = false;
  els.rankingSection.hidden = true;
  els.generatedSection.hidden = true;
  clearGeneratedFile();
  saveDraft();
});

els.unlockResults.addEventListener('click', () => {
  els.generatedSection.hidden = true;
  clearGeneratedFile();
  saveDraft();
});

els.tournamentPanels.addEventListener('click', event => {
  const panel = event.target.closest('.tournament-panel');
  if (!panel) return;
  const tournamentIndex = Number(panel.dataset.tournamentIndex);

  const addButton = event.target.closest('[data-add-player]');
  if (addButton) {
    placePlayer(tournamentIndex, addButton.dataset.addPlayer);
    return;
  }

  const removeButton = event.target.closest('[data-remove-player]');
  if (removeButton) {
    removePlayer(tournamentIndex, removeButton.dataset.removePlayer);
    return;
  }

  const item = event.target.closest('.rank-item');
  if (!item) return;
  const displayIndex = Number(item.dataset.displayIndex);

  if (event.target.closest('[data-move-up]')) {
    movePlayerByDisplayIndex(tournamentIndex, displayIndex, displayIndex - 1);
  } else if (event.target.closest('[data-move-down]')) {
    movePlayerByDisplayIndex(tournamentIndex, displayIndex, displayIndex + 1);
  }
});

els.tournamentPanels.addEventListener('dragstart', event => {
  const item = event.target.closest('.rank-item');
  if (!item) return;
  dragState = {
    fromDisplayIndex: Number(item.dataset.displayIndex),
    tournamentIndex: Number(item.dataset.tournamentIndex),
  };
  item.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
});

els.tournamentPanels.addEventListener('dragend', event => {
  const item = event.target.closest('.rank-item');
  if (item) item.classList.remove('is-dragging');
  dragState = null;
});

els.tournamentPanels.addEventListener('dragover', event => {
  if (event.target.closest('.rank-list')) {
    event.preventDefault();
  }
});

els.tournamentPanels.addEventListener('drop', event => {
  if (!dragState) return;

  const list = event.target.closest('.rank-list');
  if (!list) return;

  event.preventDefault();
  const tournamentIndex = Number(list.dataset.tournamentIndex);
  if (tournamentIndex !== dragState.tournamentIndex) return;

  const targetItem = event.target.closest('.rank-item');
  const toDisplayIndex = targetItem
    ? Number(targetItem.dataset.displayIndex)
    : getDisplayOrder(state.tournaments[tournamentIndex]).length - 1;

  movePlayerByDisplayIndex(tournamentIndex, dragState.fromDisplayIndex, toDisplayIndex);
});

els.finishNight.addEventListener('click', () => {
  if (!allTournamentsComplete()) return;
  refreshMaxHistoryVersion()
    .then(() => {
      const text = buildDataV2Text();
      setGeneratedFile(text);
      saveDraft();
      downloadGeneratedFile();
      showMessage('Data file generated and downloaded. Use Download GOPTdatav2.csv if you need another copy, or create a current server version after reviewing the output.', 'success');
    })
    .catch(error => {
      showMessage(error.message || 'Could not determine the latest data version.', 'error');
    });
});

els.replaceForm.addEventListener('submit', event => {
  createServerHistoryVersion(event).catch(error => {
    showMessage(error.message || 'Server data update failed.', 'error');
  });
});

loadHistory().catch(error => {
  showMessage(error.message, 'error');
});

window.addEventListener('beforeunload', event => {
  if (!state.draftActive) return;
  event.preventDefault();
  event.returnValue = '';
});
