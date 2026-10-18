const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createScenarioStore } = require('../src/agent/scenario-store');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-features-'));
try {
  const store = createScenarioStore(temp);
  const scenario = { name: 'Schedule', variables: { day: '2026-10-18', hour: '09:30', delay: 25, caption: 'Ngày {{day}}', target: '#schedule' }, steps: [
    { action: 'setDate', selector: '{{target}}', value: '{{day}}' },
    { action: 'setTime', locatorType: 'css', locator: '#time', value: '{{hour}}' },
    { action: 'type', selector: '#caption', text: '{{caption}}', clear: '{{clear}}' },
    { action: 'wait', ms: '{{delay}}' }
  ] };
  assert.throws(() => store.prepare(scenario), /Unknown variable: clear/);
  scenario.variables.clear = false;
  const prepared = store.prepare(scenario);
  assert.equal(prepared.steps[0].selector, '#schedule');
  assert.equal(prepared.steps[0].value, '2026-10-18');
  assert.equal(prepared.steps[1].value, '09:30');
  assert.equal(prepared.steps[2].text, 'Ngày 2026-10-18');
  assert.equal(prepared.steps[2].clear, false);
  assert.equal(prepared.steps[3].ms, 25);
  assert.equal(store.prepare({ variables: { count: 12 }, steps: [{ action: 'type', selector: '#count', text: '{{count}}' }] }).steps[0].text, '12');
  assert.equal(scenario.steps[0].value, '{{day}}', 'templates remain saved');
  assert.throws(() => store.prepare({ ...scenario, variables: { ...scenario.variables, day: '2026-02-30' } }), /valid YYYY-MM-DD/);
  assert.throws(() => store.prepare({ ...scenario, variables: { ...scenario.variables, hour: '24:30' } }), /HH:mm/);
  assert.throws(() => store.prepare({ ...scenario, variables: { ...scenario.variables, delay: '{{caption}}', caption: '{{delay}}' } }), /Circular variable/);
  assert.throws(() => store.prepare({ ...scenario, variables: { ...scenario.variables, 'bad name': '' } }), /Invalid variable name/);
  fs.writeFileSync(path.join(temp, 'upload.txt'), 'local fixture');
  const upload = { variables: { folder: temp, file: 'upload.txt' }, steps: [{ action: 'upload', folder: '{{folder}}', filename: '{{file}}' }] };
  assert.equal(store.prepare(upload).steps[0].filePath, path.join(temp, 'upload.txt'));
  store.save('source', scenario);
  const clone = store.clone('source', 'source-copy');
  assert.deepEqual(clone.steps, scenario.steps);
  assert.deepEqual(clone.variables, scenario.variables);
  assert.match(clone.name, /bản sao/);
  assert.throws(() => store.clone('source', 'source-copy'), /EEXIST/);
  assert.throws(() => store.clone('source', '../escape'), /Invalid scenario filename/);
  clone.steps[0].value = '2027-01-01'; store.save('source-copy', clone);
  assert.equal(store.load('source').steps[0].value, '{{day}}', 'clone edits must not modify source');
  console.log('Variables, date/time validation, upload paths and collision-safe independent clones: OK');
} finally {
  if (path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir())) throw new Error('Unexpected test directory');
  fs.rmSync(temp, { recursive: true, force: true });
}
