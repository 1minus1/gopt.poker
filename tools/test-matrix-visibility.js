const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require('path').join(__dirname, '../matrix.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(0, source.indexOf('const els =')), context);
for (const name of ['normalizeDateValue', 'getEasternDateKey', 'getDeltaLockedDateId', 'matrixVisibility', 'matrixDateIds', 'getMatrixResponses', 'normalizeLegacyMatrixStatuses', 'sortMatrices', 'writeLocalStore', 'saveMatrixVisibility']) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}\\n`));
  assert(match, name);
  vm.runInContext(match[0], context);
}
context.fixture = { id: 'test', updatedAt: 'keep', deltaLockedDateId: '2099-01-01', dates: ['2099-01-01', '2099-01-02', '2099-01-03'].map(id => ({id})), responses: {player: {'2099-01-01': 'PROBABLE'}} };
let persisted;
context.localStorage = {setItem(key, value) { persisted = JSON.parse(value); }};
async function main() {
  vm.runInContext('state.matrices = [fixture]; state.apiAvailable = false;', context);
  context.fixture.hiddenDateIds = ['2099-01-01'];
  assert.strictEqual(vm.runInContext('matrixVisibility(fixture).hiddenDateIds.length', context), 0);
  await assert.rejects(vm.runInContext("saveMatrixVisibility('test', 'hide_date', '2099-01-01')", context), /Unlock/);
  await vm.runInContext("saveMatrixVisibility('test', 'hide_date', '2099-01-02')", context);
  await vm.runInContext("saveMatrixVisibility('test', 'hide_date', '2099-01-03')", context);
  await assert.rejects(vm.runInContext("saveMatrixVisibility('test', 'hide_date', '2099-01-01')", context), /Unlock/);
  await vm.runInContext("saveMatrixVisibility('test', 'hide_player', 'player')", context);
  assert.deepStrictEqual(persisted.matrices[0].responses, context.fixture.responses);
  assert.strictEqual(persisted.matrices[0].updatedAt, 'keep');
  assert.strictEqual(persisted.matrices[0].deltaLockedDateId, '2099-01-01');
  await vm.runInContext("saveMatrixVisibility('test', 'unhide_dates')", context);
  await vm.runInContext("saveMatrixVisibility('test', 'unhide_players')", context);
  assert.deepStrictEqual(persisted.matrices[0].hiddenDateIds, []);
  assert.deepStrictEqual(persisted.matrices[0].hiddenPlayers, []);
  const before = JSON.stringify(persisted);
  context.fetchMatrixJson = async () => { throw new Error('Server rejected save'); };
  vm.runInContext('state.apiAvailable = true', context);
  await assert.rejects(vm.runInContext("saveMatrixVisibility('test', 'hide_player', 'player')", context), /Server rejected save/);
  assert.strictEqual(JSON.stringify(persisted), before, 'Shared failure must not save locally');
  assert.strictEqual(vm.runInContext('state.apiAvailable', context), true);
  console.log('Matrix visibility client and shared-error checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
