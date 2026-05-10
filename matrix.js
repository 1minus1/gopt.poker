const MATRIX_STORAGE_KEY = 'gopt.matrix.localPreview.v1';

const MATRIX_STATUSES = [
  { value: '', label: 'No response', shortLabel: '—', weight: 0, className: 'matrix-status-empty' },
  { value: 'OUT', label: 'OUT', shortLabel: 'OUT', weight: 0, className: 'matrix-status-out' },
  { value: 'DOUBTFUL', label: 'DOUBTFUL', shortLabel: 'DOUBTFUL', weight: 0.25, className: 'matrix-status-doubtful' },
  { value: 'QUESTIONABLE', label: 'QUESTIONABLE', shortLabel: 'QUESTIONABLE', weight: 0.5, className: 'matrix-status-questionable' },
  { value: 'PROBABLE', label: 'PROBABLE', shortLabel: 'PROBABLE', weight: 1, className: 'matrix-status-probable' },
];

const state = {
  apiAvailable: true,
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

function getStatus(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return MATRIX_STATUSES.find(status => status.value === normalized) || MATRIX_STATUSES[0];
}

function getMatrixResponses(matrix) {
  return matrix.responses && typeof matrix.responses === 'object' && !Array.isArray(matrix.responses)
    ? matrix.responses
    : {};
}

function sortMatrices(matrices) {
  return [...matrices].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function readLocalStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MATRIX_STORAGE_KEY) || '{}');
    return Array.isArray(parsed.matrices) ? parsed : { matrices: [] };
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
      Object.entries(responses).filter(([, status]) => status)
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

function createStatusCell(value, isEditing, dateId) {
  const status = getStatus(value);
  const td = document.createElement('td');
  td.className = status.className;

  if (isEditing) {
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
  const table = document.createElement('table');
  table.className = 'matrix-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const playerHead = document.createElement('th');
  playerHead.textContent = 'Player';
  headerRow.appendChild(playerHead);
  (matrix.dates || []).forEach(date => {
    const th = document.createElement('th');
    th.textContent = formatMatrixDate(date.date);
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
      tr.appendChild(createStatusCell(responses[player]?.[dateId], player === selectedPlayer, dateId));
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const tfoot = document.createElement('tfoot');
  [
    ['Probable attendees', 'probable', value => String(value)],
    ['Expected players', 'expected', value => Number(value).toFixed(2)],
    ['No response', 'missing', value => String(value)],
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

  const summary = document.createElement('summary');
  summary.textContent = `${matrix.name} (${matrixDateIds(matrix).length} dates)`;
  details.appendChild(summary);

  const bestExpected = getBestDate(matrix, 'expected');
  const bestProbable = getBestDate(matrix, 'probable');
  const metrics = document.createElement('div');
  metrics.className = 'matrix-summary-metrics';
  appendMetric(metrics, 'Best expected players', bestExpected ? `${formatMatrixDate(bestExpected.dateId)}: ${bestExpected.value.toFixed(2)}` : '—');
  appendMetric(metrics, 'Most probables', bestProbable ? `${formatMatrixDate(bestProbable.dateId)}: ${bestProbable.value}` : '—');
  details.appendChild(metrics);

  const selectedPlayer = state.selectedPlayers[matrix.id] || state.players[0] || '';
  state.selectedPlayers[matrix.id] = selectedPlayer;

  const form = document.createElement('form');
  form.className = 'matrix-editor matrix-response-form';
  form.dataset.matrixId = matrix.id;

  const label = document.createElement('label');
  label.textContent = 'Edit player';
  label.appendChild(createPlayerSelect(matrix.id, selectedPlayer));

  const tableWrap = document.createElement('div');
  tableWrap.className = 'matrix-table-wrap';
  tableWrap.appendChild(createMatrixTable(matrix, selectedPlayer));

  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = 'Save Availability';

  form.append(label, tableWrap, save);
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

function confirmMatrixDelete(matrix) {
  const matrixName = String(matrix.name || '').trim();
  const entered = window.prompt(
    `PERMANENT DELETE\n\nThis will delete "${matrixName}" and every availability response in it. There is no undo.\n\nType the matrix name exactly to delete it:`
  );

  if (entered === null) {
    return { confirmed: false, message: '' };
  }
  if (entered !== matrixName) {
    return { confirmed: false, message: 'Matrix was not deleted. The typed name did not match.' };
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
      showMessage('Matrix created.', 'success');
    })
    .catch(error => showMessage(error.message, 'error'));
});

els.list.addEventListener('change', event => {
  const playerSelect = event.target.closest('.matrix-player-select');
  if (!playerSelect) return;

  state.selectedPlayers[playerSelect.dataset.matrixId] = playerSelect.value;
  renderMatrices();
});

els.list.addEventListener('click', event => {
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
