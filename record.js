const state = {
  allPlayers: [],
  currentSeasonPlayers: [],
  details: null,
  draftActive: false,
  downloadUrl: null,
  generatedText: '',
  headerLine: '',
  historyRows: [],
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
  lockedSummary: document.getElementById('locked-summary'),
  majorNameField: document.getElementById('major-name-field'),
  majorNameInput: document.getElementById('major-name-input'),
  majorSelect: document.getElementById('major-select'),
  message: document.getElementById('record-message'),
  newPlayerInput: document.getElementById('new-player-input'),
  newSeasonField: document.getElementById('new-season-field'),
  newSeasonInput: document.getElementById('new-season-input'),
  nightDatetime: document.getElementById('night-datetime'),
  playerList: document.getElementById('player-list'),
  pointsAtStake: document.getElementById('points-at-stake'),
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
    majorName: els.majorNameInput.value,
    majorSelect: els.majorSelect.value,
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

function splitHistoryLine(line) {
  return line.split(',').map(cell => cell.trim());
}

function getMostRecentSeason() {
  return state.seasons[0]?.season || String(new Date().getFullYear());
}

function cleanTextField(value) {
  return value.trim().replace(/\s+/g, ' ');
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
    throw new Error(`${label} cannot contain commas because GOPThistory.txt is comma-separated.`);
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

  for (const row of state.historyRows) {
    const cells = splitHistoryLine(row);
    const rowTimestamp = Number(cells[2]);
    if (Number.isFinite(rowTimestamp) && localCalendarDateKey(rowTimestamp) === dateKey) {
      return {
        isMajor: String(cells[3] || '').toUpperCase() === 'YES',
        majorName: cells[4] || '',
        season: cells[1] || '',
        timestamp: rowTimestamp,
      };
    }
  }

  return null;
}

function parseHistory(data) {
  const lines = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  state.headerLine = lines[0] || '1';
  const currentVersion = Number.parseInt(state.headerLine, 10);
  if (Number.isInteger(currentVersion)) {
    state.maxHistoryVersion = Math.max(state.maxHistoryVersion || currentVersion, currentVersion);
  }
  state.historyRows = lines.slice(1).filter(line => line.trim());

  const seasonDates = new Map();
  const players = new Set();
  state.historyRows.forEach(row => {
    const cells = splitHistoryLine(row);
    const season = cells[1];
    const timestamp = Number(cells[2]);

    if (season && Number.isFinite(timestamp)) {
      seasonDates.set(season, Math.max(seasonDates.get(season) || 0, timestamp));
    }

    cells.slice(6).forEach(player => {
      if (player) players.add(player);
    });
  });

  state.seasons = Array.from(seasonDates.entries())
    .map(([season, timestamp]) => ({ season, timestamp }))
    .sort((a, b) => b.timestamp - a.timestamp);

  const latestSeason = getMostRecentSeason();
  const currentPlayers = new Set();
  state.historyRows.forEach(row => {
    const cells = splitHistoryLine(row);
    if (cells[1] === latestSeason) {
      cells.slice(6).forEach(player => {
        if (player) currentPlayers.add(player);
      });
    }
  });

  state.allPlayers = Array.from(players).sort((a, b) => a.localeCompare(b));
  state.currentSeasonPlayers = Array.from(currentPlayers).sort((a, b) => a.localeCompare(b));
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
}

function updateMajorFields() {
  const isMajor = els.majorSelect.value === 'YES';
  els.majorNameField.hidden = !isMajor;
  els.majorNameInput.required = isMajor;
  els.majorNameInput.disabled = !isMajor;

  if (!state.tournamentCountTouched) {
    const defaultCount = isMajor ? '1' : '2';
    els.tournamentCount.value = defaultCount;
    els.tournamentCount.setAttribute('value', defaultCount);
  }

  updateDerivedPoints();
}

function updateDerivedPoints() {
  const buyIn = Number(els.buyIn.value || 0);
  const points = buyIn * (els.majorSelect.value === 'YES' ? 2 : 1);
  els.pointsAtStake.textContent = Number.isFinite(points) && points > 0 ? formatNumber(points) : '0';
}

function updateLockedSummary() {
  const type = state.details.isMajor ? `Major: ${state.details.majorName}` : 'Standard night';
  const date = new Date(state.details.timestamp * 1000).toLocaleString();
  els.lockedSummary.textContent = `${state.details.season} | ${type} | ${state.details.tournamentCount} tournament(s) | ${state.details.roster.length} players | ${date}`;
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

function getSetupDetails() {
  const season = getSelectedSeason();
  const isMajor = els.majorSelect.value === 'YES';
  const majorName = isMajor ? cleanTextField(els.majorNameInput.value) : 'NO';
  const tournamentCount = Number(els.tournamentCount.value);
  const buyIn = Number(els.buyIn.value);
  const timestamp = Math.floor(new Date(els.nightDatetime.value).getTime() / 1000);
  const roster = Array.from(state.selectedPlayers).sort((a, b) => a.localeCompare(b));

  if (!season) throw new Error('Choose or enter a season.');
  if (isMajor && !majorName) throw new Error('Name the major.');
  ensureNoComma(majorName, 'Major name');
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
    throw new Error(`The active history already has a ${existingType} on ${formatCalendarDate(existingNight.timestamp)}. Choose a different event date before locking details.`);
  }

  return {
    buyIn,
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
  return state.tournaments.length > 0 &&
    state.tournaments.every(tournament => tournament.outOrder.length === state.details.roster.length);
}

function updateFinishState() {
  if (!state.details) return;

  const incomplete = state.tournaments
    .map((tournament, index) => ({ index: index + 1, remaining: state.details.roster.length - tournament.outOrder.length }))
    .filter(tournament => tournament.remaining > 0);

  els.finishNight.disabled = incomplete.length > 0;
  els.finishStatus.textContent = incomplete.length
    ? incomplete.map(tournament => `Tournament ${tournament.index}: ${tournament.remaining} remaining`).join(' | ')
    : 'All tournaments are complete.';
}

function buildHistoryText() {
  const details = state.details;
  const isMajor = details.isMajor ? 'YES' : 'NO';
  const majorName = details.isMajor ? details.majorName : 'NO';
  const pointsAtStake = formatNumber(details.pointsAtStake);
  const serverVersion = Number.parseInt(state.headerLine, 10);
  const baselineVersion = Number.isInteger(state.maxHistoryVersion)
    ? state.maxHistoryVersion
    : serverVersion;
  const nextVersion = Number.isInteger(baselineVersion) ? String(baselineVersion + 1) : state.headerLine;

  const newRows = state.tournaments.map(tournament => {
    const finishOrder = [...tournament.outOrder].reverse();
    return [
      details.league,
      details.season,
      String(details.timestamp),
      isMajor,
      majorName,
      pointsAtStake,
      ...finishOrder,
    ].join(',');
  });

  return [nextVersion, ...newRows, ...state.historyRows].join('\n') + '\n';
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
  state.downloadUrl = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
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
  els.newSeasonInput.value = setup.newSeason || '';
  els.nightDatetime.value = setup.nightDatetime || els.nightDatetime.value;
  els.majorSelect.value = setup.majorSelect || 'NO';
  els.majorNameInput.value = setup.majorName || '';
  els.newPlayerInput.value = setup.newPlayerInput || '';
  els.buyIn.value = setup.buyIn || '20';
  els.tournamentCount.value = setup.tournamentCount || els.tournamentCount.value;
  updateSeasonFields();
  updateMajorFields();
  els.tournamentCount.value = setup.tournamentCount || els.tournamentCount.value;
  updateDerivedPoints();

  state.details = draft.details || null;
  state.tournaments = Array.isArray(draft.tournaments)
    ? draft.tournaments.map(tournament => ({ outOrder: Array.isArray(tournament.outOrder) ? tournament.outOrder : [] }))
    : [];
  if (state.details && !state.tournaments.length) {
    state.tournaments = Array.from({ length: state.details.tournamentCount }, () => ({ outOrder: [] }));
  }

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
    showMessage('Finish the night before creating a server history version.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('username', els.replaceUsername.value);
  formData.append('password', els.replacePassword.value);
  formData.append('source', 'recorded-night');
  formData.append('label', 'Created from Record page');
  formData.append('historyFile', new File([state.generatedText], 'GOPThistory.txt', { type: 'text/plain' }));

  const { response, result } = await fetchUploadResult(formData);

  if (!response.ok || result.status !== 'success') {
    showMessage(result.message || 'Server history update failed.', 'error');
    return;
  }

  const createdVersion = Number.parseInt(result.versionNumber, 10);
  if (Number.isInteger(createdVersion)) {
    state.maxHistoryVersion = Math.max(state.maxHistoryVersion || createdVersion, createdVersion);
  }
  parseHistory(state.generatedText);
  clearSavedDraft();
  showMessage(`Current server history updated to version ${result.versionNumber}. The recorder is now using that version as its baseline.`, 'success');
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

  throw lastError || new Error('Server history update failed.');
}

function looksLikeHistoryFile(text) {
  return /^\d+\s*(\n|$)/.test(text.trim());
}

async function fetchHistoryText(sources = ['api/history/current', 'api/history-current.php', 'files/GOPThistory.txt']) {
  let lastError = null;

  for (const source of sources) {
    try {
      const response = await fetch(source, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not load ${source}.`);

      const text = await response.text();
      if (!looksLikeHistoryFile(text)) {
        throw new Error(`${source} did not return a GOPThistory file.`);
      }

      return text;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Could not load current history.');
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
    throw new Error('Could not determine the latest history version number.');
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
  const text = await fetchHistoryText();
  parseHistory(text);
  await refreshMaxHistoryVersion();
  renderSeasonOptions();
  renderPlayers();
  updateSeasonFields();
  updateMajorFields();
  els.nightDatetime.value = localDateTimeValue();
  showDraftRestorePrompt(loadDraft());
}

els.seasonSelect.addEventListener('change', () => {
  updateSeasonFields();
  saveDraft();
});
els.newSeasonInput.addEventListener('input', saveDraft);
els.nightDatetime.addEventListener('input', saveDraft);
els.majorSelect.addEventListener('change', () => {
  updateMajorFields();
  saveDraft();
});
els.majorNameInput.addEventListener('input', saveDraft);
els.buyIn.addEventListener('input', () => {
  updateDerivedPoints();
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
      const text = buildHistoryText();
      setGeneratedFile(text);
      saveDraft();
      downloadGeneratedFile();
      showMessage('History file generated and downloaded. Use Download GOPThistory.txt if you need another copy, or create a current server version after reviewing the output.', 'success');
    })
    .catch(error => {
      showMessage(error.message || 'Could not determine the latest history version.', 'error');
    });
});

els.replaceForm.addEventListener('submit', event => {
  createServerHistoryVersion(event).catch(error => {
    showMessage(error.message || 'Server history update failed.', 'error');
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
