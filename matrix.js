const MATRIX_STORAGE_KEY = 'gopt.matrix.localPreview.v1';

const MATRIX_STATUSES = [
  { value: '', label: 'No response', shortLabel: '—', weight: 0, className: 'matrix-status-empty' },
  { value: 'PROBABLE', label: 'PROBABLE (100%)', shortLabel: 'PROBABLE', weight: 1, className: 'matrix-status-probable' },
  { value: 'QUESTIONABLE', label: 'QUESTIONABLE (50%)', shortLabel: 'QUESTIONABLE', weight: 0.5, className: 'matrix-status-questionable' },
  { value: 'DOUBTFUL', label: 'DOUBTFUL (25%)', shortLabel: 'DOUBTFUL', weight: 0.25, className: 'matrix-status-doubtful' },
  { value: 'OUT', label: 'OUT (0%)', shortLabel: 'OUT', weight: 0, className: 'matrix-status-out' },
];

const state = {
  apiAvailable: true,
  eventDateIds: new Set(),
  matrices: [],
  players: [],
  selectedPlayers: {},
};

const els = {
  addDate: document.getElementById('add-matrix-date'),
  createForm: document.getElementById('matrix-create-form'),
  dateList: document.getElementById('matrix-date-list'),
  list: document.getElementById('matrix-list'),
  message: document.getElementById('matrix-message'),
  name: document.getElementById('matrix-name'),
};

function showMessage(text, type = 'success') {
  els.message.className = `admin-message is-${type}`;
  els.message.textContent = text;
}

function clearMessage() {
  els.message.className = 'admin-message';
  els.message.textContent = '';
}

function fetchDataSource(source) {
  return fetch(source, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Could not load ${source}.`);
      }
      return response.text();
    })
    .then(text => {
      if (!GoptData.looksLikeSupportedDataFile(text)) {
        throw new Error(`${source} did not return a supported GOPT data file.`);
      }
      return text;
    });
}

function fetchFirstAvailableDataText(sources) {
  const [source, ...remaining] = sources;
  return fetchDataSource(source).catch(error => {
    if (!remaining.length) throw error;
    return fetchFirstAvailableDataText(remaining);
  });
}

function fetchCurrentDataText() {
  return fetchFirstAvailableDataText(['api/history/current', 'api/history-current.php', 'data/GOPTdatav2.csv']);
}

function normalizeDateValue(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function formatMatrixDate(value) {
  const normalized = normalizeDateValue(value);
  if (!normalized) return value || '';
  return new Date(`${normalized}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getEasternDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isFutureMatrixDate(dateId) {
  const normalized = normalizeDateValue(dateId);
  return normalized && normalized > getEasternDateKey();
}

function getDeltaLockedDateId(matrix) {
  const locked = normalizeDateValue(matrix.deltaLockedDateId);
  if (locked) return locked;

  const legacyLockedDate = Array.isArray(matrix.dates)
    ? matrix.dates.find(date => date?.deltaLocked || date?.locked)
    : null;
  const legacyLockedDateId = normalizeDateValue(legacyLockedDate?.id || legacyLockedDate?.date);
  if (legacyLockedDateId) return legacyLockedDateId;

  const autoLockedDateIds = matrixDateIds(matrix)
    .filter(dateId => state.eventDateIds.has(dateId) && dateId < getEasternDateKey())
    .sort();
  return autoLockedDateIds[autoLockedDateIds.length - 1] || '';
}

function getMatrixDateById(matrix, dateId) {
  return Array.isArray(matrix.dates)
    ? matrix.dates.find(date => (date.id || date.date) === dateId)
    : null;
}

function isMatrixEditable(matrix) {
  const lockedDateId = getDeltaLockedDateId(matrix);
  if (lockedDateId) {
    return isFutureMatrixDate(lockedDateId);
  }

  return matrixDateIds(matrix).some(dateId => isFutureMatrixDate(dateId));
}

function isMatrixDateEditable(matrix, dateId) {
  return isMatrixEditable(matrix) && isFutureMatrixDate(dateId);
}

function getMatrixReadOnlyMessage(matrix) {
  const lockedDateId = getDeltaLockedDateId(matrix);
  if (lockedDateId && !isFutureMatrixDate(lockedDateId)) {
    return `This matrix is closed because ${formatMatrixDate(lockedDateId)} is today or in the past.`;
  }
  if (!lockedDateId && !matrixDateIds(matrix).some(dateId => isFutureMatrixDate(dateId))) {
    return 'This matrix is closed because all proposed dates are in the past.';
  }
  return '';
}

function getStatus(value) {
  const raw = String(value || '').trim().toUpperCase();
  const normalized = raw === 'IN' ? 'PROBABLE' : raw;
  return MATRIX_STATUSES.find(status => status.value === normalized) || MATRIX_STATUSES[0];
}

function getMatrixResponses(matrix) {
  return matrix.responses && typeof matrix.responses === 'object' && !Array.isArray(matrix.responses)
    ? matrix.responses
    : {};
}

function normalizeLegacyMatrixStatuses(matrices) {
  let changed = false;
  for (const matrix of matrices) {
    for (const dateMap of Object.values(getMatrixResponses(matrix))) {
      if (!dateMap || typeof dateMap !== 'object' || Array.isArray(dateMap)) continue;
      for (const [dateId, value] of Object.entries(dateMap)) {
        if (typeof value === 'string' && value.trim().toUpperCase() === 'IN') {
          dateMap[dateId] = 'PROBABLE';
          changed = true;
        }
      }
    }
  }
  return changed;
}

function sortMatrices(matrices) {
  normalizeLegacyMatrixStatuses(matrices);
  return [...matrices].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function readLocalStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MATRIX_STORAGE_KEY) || '{}');
    if (!Array.isArray(parsed.matrices)) return { matrices: [] };
    if (normalizeLegacyMatrixStatuses(parsed.matrices)) {
      try { localStorage.setItem(MATRIX_STORAGE_KEY, JSON.stringify(parsed)); } catch { /* Keep migrated data in memory if storage is full. */ }
    }
    return parsed;
  } catch {
    return { matrices: [] };
  }
}

function writeLocalStore() {
  localStorage.setItem(MATRIX_STORAGE_KEY, JSON.stringify({ matrices: state.matrices }));
}

function looksLikePhpSource(text) {
  return text.trimStart().startsWith('<?php');
}

async function readJsonResponse(response, endpoint) {
  const text = await response.text();
  if (looksLikePhpSource(text)) {
    throw new Error(`${endpoint} returned PHP source.`);
  }

  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(`${endpoint} did not return JSON.`);
  }
  if (!response.ok || result.status === 'error') {
    throw new Error(result.message || `Matrix request failed at ${endpoint}.`);
  }
  return result;
}

async function fetchMatrixJson(endpoints = ['api/matrix', 'api/matrix.php'], options = {}) {
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, options);
      return await readJsonResponse(response, endpoint);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Matrix API unavailable.');
}

function createLocalMatrix(name, dates) {
  const createdAt = new Date().toISOString();
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    createdAt,
    updatedAt: createdAt,
    dates: dates.map(date => ({ id: date, date })),
    deltaLockedDateId: '',
    responses: {},
  };
}

async function saveMatrixCreate(name, dates) {
  if (state.apiAvailable) {
    try {
      const result = await fetchMatrixJson(['api/matrix', 'api/matrix.php'], {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create',
          name,
          dates,
        }),
      });
      state.matrices = sortMatrices(result.matrices || []);
      return;
    } catch (error) {
      state.apiAvailable = false;
      showMessage('Local preview mode. Matrix changes are saved in this browser.', 'success');
    }
  }

  state.matrices = sortMatrices([createLocalMatrix(name, dates), ...state.matrices]);
  writeLocalStore();
}

async function saveMatrixResponse(matrixId, player, responses) {
  if (state.apiAvailable) {
    try {
      const result = await fetchMatrixJson(['api/matrix', 'api/matrix.php'], {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update_response',
          matrixId,
          player,
          responses,
        }),
      });
      state.matrices = sortMatrices(result.matrices || []);
      return;
    } catch (error) {
      state.apiAvailable = false;
      showMessage('Local preview mode. Matrix changes are saved in this browser.', 'success');
    }
  }

  state.matrices = state.matrices.map(matrix => {
    if (matrix.id !== matrixId) return matrix;
    const nextResponses = { ...getMatrixResponses(matrix) };
    const cleanResponses = Object.fromEntries(
      Object.entries(responses).map(([dateId, status]) => [dateId, getStatus(status).value]).filter(([, status]) => status)
    );

    if (Object.keys(cleanResponses).length) {
      nextResponses[player] = cleanResponses;
    } else {
      delete nextResponses[player];
    }

    return {
      ...matrix,
      updatedAt: new Date().toISOString(),
      responses: nextResponses,
    };
  });
  writeLocalStore();
}

async function saveMatrixDeltaLock(matrixId, dateId) {
  if (state.apiAvailable) {
    try {
      const result = await fetchMatrixJson(['api/matrix', 'api/matrix.php'], {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'set_delta_lock',
          matrixId,
          dateId,
        }),
      });
      state.matrices = sortMatrices(result.matrices || []);
      return;
    } catch (error) {
      state.apiAvailable = false;
      showMessage('Local preview mode. Matrix changes are saved in this browser.', 'success');
    }
  }

  state.matrices = state.matrices.map(matrix => {
    if (matrix.id !== matrixId) return matrix;
    if (!isMatrixEditable(matrix)) {
      throw new Error('This matrix is no longer editable.');
    }
    if (dateId && !isFutureMatrixDate(dateId)) {
      throw new Error('Past dates cannot be delta-locked.');
    }
    return {
      ...matrix,
      deltaLockedDateId: dateId,
      updatedAt: new Date().toISOString(),
    };
  });
  writeLocalStore();
}

async function saveMatrixDelete(matrixId) {
  if (state.apiAvailable) {
    try {
      const result = await fetchMatrixJson(['api/matrix', 'api/matrix.php'], {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'delete',
          matrixId,
        }),
      });
      state.matrices = sortMatrices(result.matrices || []);
      delete state.selectedPlayers[matrixId];
      return;
    } catch (error) {
      state.apiAvailable = false;
      showMessage('Local preview mode. Matrix changes are saved in this browser.', 'success');
    }
  }

  state.matrices = sortMatrices(state.matrices.filter(matrix => matrix.id !== matrixId));
  delete state.selectedPlayers[matrixId];
  writeLocalStore();
}

async function loadPlayers() {
  const text = await fetchCurrentDataText();
  const parsed = GoptData.parseDataFile(text, { normalizePlayerName: true });
  const players = new Set();
  state.eventDateIds = new Set(GoptData.buildNights(parsed.rows).map(night => GoptData.localDateKeyFromTimestamp(night.timestamp)));

  parsed.rows.forEach(row => {
    row.finishers.forEach(player => {
      if (player) players.add(player);
    });
  });

  state.players = Array.from(players).sort((a, b) => a.localeCompare(b));
}

async function loadMatrices() {
  try {
    const result = await fetchMatrixJson();
    state.apiAvailable = true;
    state.matrices = sortMatrices(result.matrices || []);
  } catch {
    state.apiAvailable = false;
    state.matrices = sortMatrices(readLocalStore().matrices);
    showMessage('Local preview mode. Matrix changes are saved in this browser.', 'success');
  }
}

function addDateInput(value = '') {
  const row = document.createElement('div');
  row.className = 'matrix-date-row';

  const input = document.createElement('input');
  input.type = 'date';
  input.value = normalizeDateValue(value);
  input.required = true;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    row.remove();
    if (!els.dateList.children.length) {
      addDateInput();
    }
  });

  row.append(input, remove);
  els.dateList.appendChild(row);
}

function collectCreateDates() {
  const dates = Array.from(els.dateList.querySelectorAll('input[type="date"]'))
    .map(input => normalizeDateValue(input.value))
    .filter(Boolean);
  const uniqueDates = Array.from(new Set(dates)).sort();

  if (!uniqueDates.length) {
    throw new Error('Add at least one candidate date.');
  }
  if (uniqueDates.length !== dates.length) {
    throw new Error('Candidate dates must be unique.');
  }

  return uniqueDates;
}

function matrixDateIds(matrix) {
  return Array.isArray(matrix.dates) ? matrix.dates.map(date => date.id || date.date).filter(Boolean) : [];
}

function calculateDateTotals(matrix) {
  const responses = getMatrixResponses(matrix);
  const totals = Object.fromEntries(matrixDateIds(matrix).map(dateId => [
    dateId,
    {
      probable: 0,
      expected: 0,
      missing: 0,
    },
  ]));

  state.players.forEach(player => {
    matrixDateIds(matrix).forEach(dateId => {
      const status = getStatus(responses[player]?.[dateId]);
      if (!status.value) {
        totals[dateId].missing += 1;
      }
      if (status.value === 'PROBABLE') {
        totals[dateId].probable += 1;
      }
      totals[dateId].expected += status.weight;
    });
  });

  return totals;
}

function getBestDate(matrix, field) {
  const totals = calculateDateTotals(matrix);
  return matrixDateIds(matrix)
    .map(dateId => ({ dateId, value: totals[dateId]?.[field] || 0 }))
    .sort((a, b) => {
      if (a.value !== b.value) return b.value - a.value;
      return a.dateId.localeCompare(b.dateId);
    })[0];
}

function createStatusSelect(value, dateId) {
  const select = document.createElement('select');
  select.dataset.dateId = dateId;
  MATRIX_STATUSES.forEach(status => {
    const option = document.createElement('option');
    option.value = status.value;
    option.textContent = status.label;
    select.appendChild(option);
  });
  select.value = getStatus(value).value;
  return select;
}

function createStatusCell(value, isEditing, dateId, isEditable) {
  const status = getStatus(value);
  const td = document.createElement('td');
  td.className = status.className;

  if (!isEditable) {
    td.classList.add('matrix-readonly-cell');
    td.title = 'This date is no longer editable.';
  }

  if (isEditing && isEditable) {
    td.appendChild(createStatusSelect(status.value, dateId));
  } else {
    td.textContent = status.shortLabel;
  }

  return td;
}

function createMatrixTable(matrix, selectedPlayer) {
  const responses = getMatrixResponses(matrix);
  const dateIds = matrixDateIds(matrix);
  const totals = calculateDateTotals(matrix);
  const lockedDateId = getDeltaLockedDateId(matrix);
  const matrixEditable = isMatrixEditable(matrix);
  const table = document.createElement('table');
  table.className = `matrix-table${lockedDateId ? ' has-delta-lock' : ''}`;
  table.style.setProperty('--matrix-table-min-width', `${9 + Math.max(dateIds.length, 1) * 10.5}rem`);

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const playerHead = document.createElement('th');
  playerHead.textContent = 'Player';
  headerRow.appendChild(playerHead);
  (matrix.dates || []).forEach(date => {
    const dateId = date.id || date.date;
    const isLocked = lockedDateId === dateId;
    const canChangeLock = matrixEditable && isFutureMatrixDate(dateId);
    const th = document.createElement('th');
    th.className = isLocked ? 'matrix-delta-locked-date' : '';

    const dateLabel = document.createElement('span');
    dateLabel.className = 'matrix-date-label';
    dateLabel.textContent = formatMatrixDate(date.date);
    th.appendChild(dateLabel);

    if (isLocked) {
      const badge = document.createElement('span');
      badge.className = 'matrix-delta-lock-badge';
      badge.textContent = 'Delta locked';
      th.appendChild(badge);
    }

    const lockButton = document.createElement('button');
    lockButton.type = 'button';
    lockButton.className = 'matrix-delta-lock-button';
    lockButton.dataset.deltaLockMatrixId = matrix.id;
    lockButton.dataset.deltaLockDateId = dateId;
    lockButton.textContent = isLocked ? 'Unlock' : 'Delta Lock';
    lockButton.disabled = !canChangeLock;
    lockButton.title = !canChangeLock
      ? 'Past dates cannot be delta-locked.'
      : isLocked
        ? 'Remove this confirmed event date.'
        : 'Set this as the confirmed event date.';
    th.appendChild(lockButton);
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  state.players.forEach(player => {
    const tr = document.createElement('tr');
    if (player === selectedPlayer) {
      tr.className = 'matrix-editing-row';
    }

    const playerCell = document.createElement('td');
    playerCell.textContent = player;
    tr.appendChild(playerCell);

    dateIds.forEach(dateId => {
      tr.appendChild(createStatusCell(
        responses[player]?.[dateId],
        player === selectedPlayer,
        dateId,
        isMatrixDateEditable(matrix, dateId)
      ));
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const tfoot = document.createElement('tfoot');
  [
    ['# PROBABLE', 'probable', value => String(value)],
    ['Expected #', 'expected', value => Number(value).toFixed(2)],
  ].forEach(([label, field, formatter]) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = label;
    tr.appendChild(th);

    dateIds.forEach(dateId => {
      const td = document.createElement('td');
      td.textContent = formatter(totals[dateId]?.[field] || 0);
      tr.appendChild(td);
    });
    tfoot.appendChild(tr);
  });
  table.appendChild(tfoot);

  return table;
}

function createPlayerSelect(matrixId, selectedPlayer) {
  const select = document.createElement('select');
  select.className = 'matrix-player-select';
  select.dataset.matrixId = matrixId;

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose player';
  select.appendChild(placeholder);

  state.players.forEach(player => {
    const option = document.createElement('option');
    option.value = player;
    option.textContent = player;
    select.appendChild(option);
  });
  select.value = selectedPlayer;
  return select;
}

function appendMetric(parent, label, value) {
  const metric = document.createElement('div');
  metric.className = 'matrix-metric';
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  const valueEl = document.createElement('strong');
  valueEl.textContent = value;
  metric.append(labelEl, valueEl);
  parent.appendChild(metric);
}

function createMatrixCard(matrix, index) {
  const details = document.createElement('details');
  details.className = 'matrix-card';
  details.open = index === 0;
  const lockedDateId = getDeltaLockedDateId(matrix);
  const readOnlyMessage = getMatrixReadOnlyMessage(matrix);
  const matrixEditable = isMatrixEditable(matrix);

  const summary = document.createElement('summary');
  summary.textContent = `${matrix.name} (${matrixDateIds(matrix).length} dates${lockedDateId ? `, delta locked ${formatMatrixDate(lockedDateId)}` : ''})`;
  details.appendChild(summary);

  const bestExpected = getBestDate(matrix, 'expected');
  const bestProbable = getBestDate(matrix, 'probable');
  const metrics = document.createElement('div');
  metrics.className = 'matrix-summary-metrics';
  appendMetric(metrics, 'Best expected players', bestExpected ? `${formatMatrixDate(bestExpected.dateId)}: ${bestExpected.value.toFixed(2)}` : '—');
  appendMetric(metrics, 'Most PROBABLE', bestProbable ? `${formatMatrixDate(bestProbable.dateId)}: ${bestProbable.value}` : '—');
  appendMetric(metrics, 'Delta lock', lockedDateId ? formatMatrixDate(lockedDateId) : 'Not set');
  details.appendChild(metrics);

  if (readOnlyMessage) {
    const readOnly = document.createElement('p');
    readOnly.className = 'matrix-readonly-note';
    readOnly.textContent = readOnlyMessage;
    details.appendChild(readOnly);
  }

  const selectedPlayer = state.selectedPlayers[matrix.id] || '';
  state.selectedPlayers[matrix.id] = selectedPlayer;

  const form = document.createElement('form');
  form.className = 'matrix-editor matrix-response-form';
  form.dataset.matrixId = matrix.id;

  const label = document.createElement('label');
  label.textContent = matrixEditable ? 'Edit player' : 'Player';
  const playerSelect = createPlayerSelect(matrix.id, selectedPlayer);
  playerSelect.disabled = !matrixEditable;
  label.appendChild(playerSelect);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'matrix-table-wrap';
  tableWrap.appendChild(createMatrixTable(matrix, selectedPlayer));

  const saveBar = document.createElement('div');
  saveBar.className = 'matrix-save-bar';
  saveBar.hidden = true;

  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'matrix-save-button';
  save.textContent = 'Save Availability';
  saveBar.appendChild(save);

  form.append(label, saveBar, tableWrap);
  details.appendChild(form);

  const actions = document.createElement('div');
  actions.className = 'matrix-card-actions';

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'matrix-delete-button';
  deleteButton.dataset.deleteMatrixId = matrix.id;
  deleteButton.textContent = 'Delete Matrix';

  actions.appendChild(deleteButton);
  details.appendChild(actions);

  return details;
}

function updateMatrixSaveState(form, isDirty) {
  const saveButton = form?.querySelector('.matrix-save-button');
  const saveBar = form?.querySelector('.matrix-save-bar');
  if (!saveButton) return;

  form.classList.toggle('has-unsaved-changes', isDirty);
  if (saveBar) {
    saveBar.hidden = !isDirty;
  }
  saveButton.textContent = isDirty ? 'Save Changes' : 'Save Availability';
}

function confirmMatrixDelete(matrix) {
  const matrixName = String(matrix.name || '').trim();
  const entered = window.prompt(
    `PERMANENT DELETE\n\nThis will delete "${matrixName}" and every availability response in it. There is no undo.\n\nType 'Yes' to confirm:`
  );

  if (entered === null) {
    return { confirmed: false, message: '' };
  }
  if (entered !== 'Yes') {
    return { confirmed: false, message: 'Matrix was not deleted. Type "Yes" to confirm deletion.' };
  }
  return { confirmed: true, message: '' };
}

function renderMatrices() {
  els.list.innerHTML = '';

  if (!state.players.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No players are available from the current data file.';
    els.list.appendChild(empty);
    return;
  }

  if (!state.matrices.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No matrices yet.';
    els.list.appendChild(empty);
    return;
  }

  sortMatrices(state.matrices).forEach((matrix, index) => {
    els.list.appendChild(createMatrixCard(matrix, index));
  });
}

function resetCreateForm() {
  els.name.value = '';
  els.dateList.innerHTML = '';
  addDateInput();
}

els.addDate.addEventListener('click', () => addDateInput());

els.createForm.addEventListener('submit', event => {
  event.preventDefault();
  clearMessage();

  let dates;
  try {
    dates = collectCreateDates();
  } catch (error) {
    showMessage(error.message, 'error');
    return;
  }

  saveMatrixCreate(els.name.value.trim(), dates)
    .then(() => {
      resetCreateForm();
      renderMatrices();
      const today = getEasternDateKey();
      const pastCount = dates.filter(date => date <= today).length;
      if (pastCount === dates.length) {
        showMessage('Matrix created, but it will not be editable because every proposed date is today or in the past.', 'success');
      } else if (pastCount) {
        showMessage('Matrix created. Proposed dates that are today or in the past will not be editable.', 'success');
      } else {
        showMessage('Matrix created.', 'success');
      }
    })
    .catch(error => showMessage(error.message, 'error'));
});

els.list.addEventListener('change', event => {
  const playerSelect = event.target.closest('.matrix-player-select');
  if (playerSelect) {
    state.selectedPlayers[playerSelect.dataset.matrixId] = playerSelect.value;
    renderMatrices();
    return;
  }

  const statusSelect = event.target.closest('select[data-date-id]');
  if (!statusSelect) return;

  const cell = statusSelect.closest('td');
  if (cell) {
    cell.className = getStatus(statusSelect.value).className;
  }
  updateMatrixSaveState(statusSelect.closest('.matrix-response-form'), true);
});

els.list.addEventListener('click', event => {
  const deltaLockButton = event.target.closest('[data-delta-lock-matrix-id]');
  if (deltaLockButton) {
    const matrixId = deltaLockButton.dataset.deltaLockMatrixId;
    const dateId = deltaLockButton.dataset.deltaLockDateId;
    const matrix = state.matrices.find(item => item.id === matrixId);
    if (!matrix) {
      showMessage('Matrix not found.', 'error');
      return;
    }

    const nextDateId = getDeltaLockedDateId(matrix) === dateId ? '' : dateId;
    deltaLockButton.disabled = true;
    clearMessage();
    saveMatrixDeltaLock(matrixId, nextDateId)
      .then(() => {
        renderMatrices();
        showMessage(nextDateId ? `Delta locked ${formatMatrixDate(nextDateId)}.` : 'Delta lock removed.', 'success');
      })
      .catch(error => {
        deltaLockButton.disabled = false;
        showMessage(error.message, 'error');
      });
    return;
  }

  const deleteButton = event.target.closest('[data-delete-matrix-id]');
  if (!deleteButton) return;

  const matrixId = deleteButton.dataset.deleteMatrixId;
  const matrix = state.matrices.find(item => item.id === matrixId);
  if (!matrix) {
    showMessage('Matrix not found.', 'error');
    return;
  }

  const confirmation = confirmMatrixDelete(matrix);
  if (!confirmation.confirmed) {
    if (confirmation.message) {
      showMessage(confirmation.message, 'error');
    }
    return;
  }

  clearMessage();
  deleteButton.disabled = true;
  saveMatrixDelete(matrixId)
    .then(() => {
      renderMatrices();
      showMessage('Matrix deleted.', 'success');
    })
    .catch(error => {
      deleteButton.disabled = false;
      showMessage(error.message, 'error');
    });
});

els.list.addEventListener('submit', event => {
  const form = event.target.closest('.matrix-response-form');
  if (!form) return;
  event.preventDefault();
  clearMessage();

  const matrixId = form.dataset.matrixId;
  const player = form.querySelector('.matrix-player-select')?.value || '';
  const responses = {};
  form.querySelectorAll('select[data-date-id]').forEach(select => {
    responses[select.dataset.dateId] = select.value;
  });

  saveMatrixResponse(matrixId, player, responses)
    .then(() => {
      updateMatrixSaveState(form, false);
      delete state.selectedPlayers[matrixId];
      renderMatrices();
      showMessage('Availability saved.', 'success');
    })
    .catch(error => showMessage(error.message, 'error'));
});

Promise.all([loadPlayers(), loadMatrices()])
  .then(() => {
    resetCreateForm();
    renderMatrices();
  })
  .catch(error => {
    showMessage(error.message || 'Matrix failed to load.', 'error');
  });
