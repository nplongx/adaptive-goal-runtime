import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ADAPTIVE_GOAL_EXECUTION_READINESS_SCHEMA_VERSION,
  assessAdaptiveGoalExecutionReadiness
} from '../index.js';
import { artifactSchemaForType } from '@runalith/workflow-contracts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/adaptive-goal-readiness-draft.json'), 'utf8'));
const step = fixture.steps[0];
const refs = ['artifact://artifact-requirements', 'artifact://artifact-architecture'];

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function hash(value) { return crypto.createHash('sha256').update(stableJson(value)).digest('hex'); }
function rehashDraft(draft) {
  const { draftHash: _oldHash, ...unsigned } = draft;
  return { ...unsigned, draftHash: hash(unsigned) };
}
function draftWithRefs(supportingEvidenceRefs) {
  return rehashDraft({
    ...structuredClone(fixture),
    steps: fixture.steps.map(item => ({ ...item, supportingEvidenceRefs }))
  });
}
function planFor(children = [{
  id: 'standard-engineer', role: 'engineer', capability: 'code.modify', dependencies: [],
  execution: { output_artifact_type: 'implementation' }
}]) {
  const unsigned = {
    workflow_id: 'standard-engineering', workflow_version: 3,
    job_id: 'agg-execution-readiness-package-test', children
  };
  return { ...unsigned, plan_hash: hash(unsigned) };
}
function bindings(draft = fixture, capability = 'code.modify', taskId = 'standard-engineer') {
  return [{ step_id: draft.steps[0].id, task_id: taskId, capability }];
}
function validEvidence(ref, type, artifactId = `artifact-${type}`) {
  return {
    ref,
    sourceJobId: 'job_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    artifactId,
    type,
    schemaVersion: artifactSchemaForType(type).schema_version,
    status: 'active',
    contentHash: hash(`validated-content:${artifactId}`),
    lineageValid: true,
    artifactCreatedEventId: `event-created-${artifactId}`,
    producerContractValid: true,
    producerRole: type === 'requirements' ? 'product-owner' : 'architect',
    producerTaskId: `task-${artifactId}`,
    producerTaskStatus: 'completed',
    producerTaskCompleted: true,
    producerResultId: `result-${artifactId}`,
    producerResultOutcome: 'success',
    producerCompletionEventId: `completion-${artifactId}`,
    producerCompletionEventType: 'task.local_completed',
    producerResultLineageValid: true
  };
}
function sourceEvidence(reference, digest = 'a'.repeat(64), overrides = {}) {
  return {
    reference,
    classification: 'source_bytes_verified_claim_unverified',
    integrityVerified: true,
    claimVerified: false,
    independenceVerified: false,
    path: 'src/runtime/fixture.js',
    expectedSha256: digest,
    observedSha256: digest,
    sizeBytes: 123,
    modifiedAt: '2026-11-13T12:00:00.000Z',
    maxBytes: 4096,
    ...overrides
  };
}

test('exports versioned readiness assessment and reports review-only gates', () => {
  assert.equal(ADAPTIVE_GOAL_EXECUTION_READINESS_SCHEMA_VERSION, 1);
  const before = structuredClone(fixture);
  const report = assessAdaptiveGoalExecutionReadiness(fixture, 'standard-engineering', planFor(), bindings(), [
    validEvidence(refs[0], 'requirements'), validEvidence(refs[1], 'architecture')
  ]);
  assert.equal(report.status, 'eligible_for_execution_graph_review', JSON.stringify(report, null, 2));
  assert.equal(report.readyForExecutionGraphReview, true);
  assert.equal(report.contractReady, true);
  assert.equal(report.evidenceReady, true);
  assert.equal(report.actions.length, 1);
  assert.equal(report.actions[0].roleContract.id, 'agent.engineer');
  assert.equal(report.actions[0].declaredCapability, 'code.modify');
  assert.deepEqual(report.actions[0].roleContract.requiredInputs, ['requirements', 'architecture']);
  assert.equal(report.actions[0].outputEvidenceContract.type, 'implementation');
  assert.deepEqual(report.actions[0].outputEvidenceContract.requiredContentFields, ['summary', 'files_changed', 'verification', 'execution']);
  assert.deepEqual(report.actions[0].supportingEvidence.verifiedArtifacts.map(item => item.type).sort(), ['architecture', 'requirements']);
  assert.deepEqual(report.actions[0].execution, { enabled: false, executable: null, args: null, authorization: 'none' });
  assert.deepEqual(report.gates, {
    humanReviewRequired: true, workflowApprovalRequired: true, executionGraphCreated: false,
    executableContractsCreated: false, immutableExecutionPlanCreated: false, dispatchAllowed: false,
    executionAuthorized: false
  });
  assert.deepEqual(fixture, before, 'assessment must not mutate the detached draft');
});

test('separates valid role/task contract from missing or unresolved durable evidence', () => {
  const noEvidenceDraft = draftWithRefs([]);
  const noEvidence = assessAdaptiveGoalExecutionReadiness(noEvidenceDraft, 'standard-engineering', planFor(), bindings(noEvidenceDraft));
  assert.equal(noEvidence.contractReady, false, 'required artifact inputs remain missing without resolved evidence or mapped ancestors');
  assert.equal(noEvidence.evidenceReady, false);
  assert.ok(noEvidence.evidenceBlockers.some(item => item.code === 'STEP_EVIDENCE_MISSING'));
  const unresolved = assessAdaptiveGoalExecutionReadiness(fixture, 'standard-engineering', planFor(), bindings(), []);
  assert.equal(unresolved.evidenceReady, false);
  assert.ok(unresolved.evidenceBlockers.some(item => item.code === 'SOURCE_EVIDENCE_UNVERIFIED'));
});

test('keeps content-addressed file integrity separate from durable artifact lineage', () => {
  const fileRef = `file:src/runtime/fixture.js#sha256=${'b'.repeat(64)}`;
  const fileDraft = draftWithRefs([...refs, fileRef]);
  const report = assessAdaptiveGoalExecutionReadiness(fileDraft, 'standard-engineering', planFor(), bindings(fileDraft), [
    validEvidence(refs[0], 'requirements'), validEvidence(refs[1], 'architecture')
  ], [sourceEvidence(fileRef)]);
  assert.equal(report.readyForExecutionGraphReview, true, JSON.stringify(report.evidenceBlockers));
  assert.equal(report.actions[0].supportingEvidence.verified, true);
  assert.equal(report.actions[0].supportingEvidence.sourceFilesIntegrityVerified, true);
  assert.equal(report.actions[0].supportingEvidence.sourceFiles[0].claimVerified, false);
  assert.equal(report.actions[0].supportingEvidence.sourceFiles[0].independenceVerified, false);
});

test('rejects stale file digest and never lets source-file integrity replace durable artifacts', () => {
  const fileRef = `file:src/runtime/fixture.js#sha256=${'b'.repeat(64)}`;
  const draft = draftWithRefs([fileRef]);
  const report = assessAdaptiveGoalExecutionReadiness(draft, 'standard-engineering', planFor(), bindings(draft), [], [
    sourceEvidence(fileRef, 'b'.repeat(64), {
      classification: 'source_bytes_hash_mismatch', integrityVerified: false, observedSha256: 'c'.repeat(64)
    })
  ]);
  assert.equal(report.evidenceReady, false);
  assert.ok(report.evidenceBlockers.some(item => item.code === 'SOURCE_FILE_EVIDENCE_INTEGRITY_FAILED'));
  assert.ok(report.evidenceBlockers.some(item => item.code === 'STEP_DURABLE_EVIDENCE_MISSING'));
  assert.equal(report.actions[0].supportingEvidence.verified, false);
});

test('rejects malformed, duplicate and out-of-scope evidence resolutions', () => {
  const single = validEvidence(refs[0], 'requirements');
  const report = assessAdaptiveGoalExecutionReadiness(fixture, 'standard-engineering', planFor(), bindings(), [
    single, { ...single }, { ...validEvidence('artifact://other', 'requirements') }
  ]);
  assert.equal(report.evidenceReady, false);
  assert.ok(report.evidenceBlockers.some(item => item.code === 'EVIDENCE_RESOLUTION_INVALID'));
});

test('rejects stale artifacts, producer/result lineage failures and schema mismatch separately', () => {
  const requirements = validEvidence(refs[0], 'requirements');
  const architecture = validEvidence(refs[1], 'architecture');
  for (const [mutate, code] of [
    [row => ({ ...row, status: 'superseded' }), 'SOURCE_EVIDENCE_NOT_ACTIVE'],
    [row => ({ ...row, producerContractValid: false }), 'SOURCE_EVIDENCE_NOT_ACTIVE'],
    [row => ({ ...row, producerTaskCompleted: false }), 'SOURCE_EVIDENCE_NOT_ACTIVE'],
    [row => ({ ...row, producerResultLineageValid: false, producerResultLineageFailureReason: 'missing completion result pair' }), 'SOURCE_EVIDENCE_RESULT_LINEAGE_INVALID'],
    [row => ({ ...row, schemaVersion: 99 }), 'SOURCE_EVIDENCE_SCHEMA_MISMATCH']
  ]) {
    const altered = mutate(requirements);
    const report = assessAdaptiveGoalExecutionReadiness(fixture, 'standard-engineering', planFor(), bindings(), [altered, architecture]);
    assert.equal(report.evidenceReady, false, code);
    assert.ok(report.evidenceBlockers.some(item => item.code === code), code);
  }
});

test('rejects task capability mismatch even when structural mapping is valid', () => {
  const report = assessAdaptiveGoalExecutionReadiness(fixture, 'standard-engineering', planFor(), bindings(fixture, 'research.collect'), [
    validEvidence(refs[0], 'requirements'), validEvidence(refs[1], 'architecture')
  ]);
  assert.equal(report.contractReady, false);
  assert.ok(report.blockers.some(item => item.code === 'CAPABILITY_CONTRACT_MISMATCH'));
  assert.equal(report.gates.dispatchAllowed, false);
});

test('rejects artifact inputs not present in supporting evidence or mapped task ancestry', () => {
  const noEvidenceDraft = draftWithRefs([]);
  const report = assessAdaptiveGoalExecutionReadiness(noEvidenceDraft, 'standard-engineering', planFor(), bindings(noEvidenceDraft));
  assert.ok(report.blockers.some(item => item.code === 'INPUT_ARTIFACTS_UNAVAILABLE' &&
    item.missingArtifactTypes.includes('requirements') && item.missingArtifactTypes.includes('architecture')));
});

test('rejects mutated compiled plan hashes and binding-shape authority injection', () => {
  const plan = planFor();
  const altered = { ...plan, children: plan.children.map(child => ({ ...child, role: 'untrusted-role' })) };
  const badPlan = assessAdaptiveGoalExecutionReadiness(fixture, 'standard-engineering', altered, bindings(), [
    validEvidence(refs[0], 'requirements'), validEvidence(refs[1], 'architecture')
  ]);
  assert.ok(badPlan.blockers.some(item => item.code === 'WORKFLOW_PLAN_INVALID'));
  const injected = assessAdaptiveGoalExecutionReadiness(fixture, 'standard-engineering', plan, [
    { ...bindings()[0], executable: 'node', args: ['unsafe.js'] }
  ], [validEvidence(refs[0], 'requirements'), validEvidence(refs[1], 'architecture')]);
  assert.ok(injected.blockers.some(item => item.code === 'ACTION_BINDING_INVALID'));
  assert.equal(injected.gates.executionAuthorized, false);
  assert.equal(injected.gates.dispatchAllowed, false);
});
