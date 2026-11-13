import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src/runtime/adaptive-goal-action-intent-binding-resolver.js'),'utf8');

test('AGG resolver contains no DB handles, SQL writes, transactions or shell/process execution',()=>{
  assert.doesNotMatch(source,/\b(?:DatabaseSync|WorkflowStore|sqlite3|better-sqlite3)\b/);
  assert.doesNotMatch(source,/\b(?:INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|CREATE TABLE)\b/i);
  assert.doesNotMatch(source,/\.(?:exec|prepare|transaction)\s*\(/);
  assert.doesNotMatch(source,/child_process|spawnSync|execSync|fetch\s*\(/);
});

test('AGG resolver source uses public contract APIs, not monolith deep modules',()=>{
  assert.doesNotMatch(source,/\.\.\/\.\.\/|src\/runtime\/job-store|workflow-state-port|trust-configuration\.js/);
});


test('AGG Workflow Port v1 is a frozen named-method allowlist with no SQL/transaction surface', async () => {
  const portApi = await import('../src/runtime/agg-action-intent-workflow-port.js');
  const methods = portApi.AGG_ACTION_INTENT_WORKFLOW_PORT_METHODS;
  const implementation = Object.fromEntries(methods.map(method => [method, () => null]));
  const port = portApi.createAggActionIntentWorkflowPort(implementation);
  assert.equal(port.version, 1);
  assert.ok(methods.includes('listEventsForJob'), 'the port must expose the resolver event query');
  assert.equal(Object.isFrozen(port), true);
  assert.deepEqual(Object.keys(port).filter(key => key !== 'kind' && key !== 'version').sort(), [...methods].sort());
  assert.equal(portApi.assertAggActionIntentWorkflowPort(port), port);
  assert.throws(() => portApi.createAggActionIntentWorkflowPort({}), /must provide/);
  assert.throws(() => portApi.assertAggActionIntentWorkflowPort({...port, db: {}}), /frozen and read-only/);
});


test('public resolver factory rejects missing Workflow port and accepts only its versioned read allowlist', async () => {
  const api = await import('../index.js');
  assert.throws(() => api.createAdaptiveGoalActionIntentBindingResolver({}), /Workflow Port v1 implementation is required/);
  const methods = api.AGG_ACTION_INTENT_WORKFLOW_PORT_METHODS;
  const workflowPort = api.createAggActionIntentWorkflowPort(
    Object.fromEntries(methods.map(method => [method, () => method === 'listEventsForJob' ? [] : null]))
  );
  const validResolver = api.createAdaptiveGoalActionIntentBindingResolver({
    workflowPort, verifyCandidateHash: () => true, assertReviewerAttestation: () => true
  });
  assert.deepEqual(validResolver('job-without-candidate'), []);
  const asyncPort = api.createAggActionIntentWorkflowPort(
    Object.fromEntries(methods.map(method => [method, () => method === 'listEventsForJob' ? Promise.resolve([]) : null]))
  );
  const asyncResolver = api.createAdaptiveGoalActionIntentBindingResolver({
    workflowPort: asyncPort, verifyCandidateHash: () => true, assertReviewerAttestation: () => true
  });
  assert.throws(() => asyncResolver('job-without-candidate'), /synchronous array/);
  assert.throws(() => api.createAdaptiveGoalActionIntentBindingResolver({
    workflowPort: { ...workflowPort, db: {} }, verifyCandidateHash: () => true, assertReviewerAttestation: () => true
  }), /frozen and read-only/);
});
