import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ADAPTIVE_GOAL_COMPATIBILITY_SCHEMA_VERSION,
  ADAPTIVE_GOAL_COMPATIBLE_WORKFLOW_IDS,
  assessAdaptiveGoalPlanCompatibility
} from '../index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const draftFixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/adaptive-goal-plan-draft.json'), 'utf8'));
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function hash(value) { return crypto.createHash('sha256').update(stableJson(value)).digest('hex'); }
function planFor(children = [
  { id: 'standard-engineer', role: 'engineer', dependencies: [] },
  { id: 'standard-qa', role: 'qa', dependencies: ['standard-engineer'] },
  { id: 'standard-platform', role: 'platform', dependencies: ['standard-engineer'] }
]) {
  const plan = { workflow_id: 'standard-engineering', workflow_version: 3, job_id: 'agg-plan-compatibility-package-test', children };
  return { ...plan, plan_hash: hash(plan) };
}
function bindings(draft = draftFixture) {
  return [
    { step_id: draft.steps[0].id, task_id: 'standard-engineer' },
    { step_id: draft.steps[1].id, task_id: 'standard-qa' }
  ];
}
function rehashDraft(draft) {
  const { draftHash: _oldHash, ...unsigned } = draft;
  return { ...unsigned, draftHash: hash(unsigned) };
}

test('compatibility API exposes immutable supported Workflow IDs and schema version', () => {
  assert.equal(ADAPTIVE_GOAL_COMPATIBILITY_SCHEMA_VERSION, 1);
  assert.deepEqual(ADAPTIVE_GOAL_COMPATIBLE_WORKFLOW_IDS, [
    'standard-engineering', 'hybrid-engineering', 'engineering', 'production'
  ]);
  assert.ok(Object.isFrozen(ADAPTIVE_GOAL_COMPATIBLE_WORKFLOW_IDS));
});

test('accepts exact explicit mapping while preserving review-only gates and input immutability', () => {
  const draft = structuredClone(draftFixture);
  const original = structuredClone(draft);
  const plan = planFor();
  const report = assessAdaptiveGoalPlanCompatibility(draft, 'standard-engineering', plan, bindings(draft));
  assert.equal(report.eligible, true, JSON.stringify(report.blockers));
  assert.equal(report.status, 'eligible_for_human_review');
  assert.equal(report.schemaVersion, 1);
  assert.deepEqual(report.bindings.map(item => [item.stepId, item.taskId]), [
    [draft.steps[0].id, 'standard-engineer'], [draft.steps[1].id, 'standard-qa']
  ]);
  assert.equal(report.workflow.version, 3);
  assert.equal(report.workflow.planHash, plan.plan_hash);
  assert.ok(report.warnings.some(item => /additional mandatory child task/.test(item)));
  assert.deepEqual(report.gates, {
    workflowProposalCreated: false,
    immutableExecutionPlanCreated: false,
    humanReviewRequired: true,
    workflowApprovalRequired: true,
    dispatchAllowed: false,
    executionAuthorized: false
  });
  assert.deepEqual(draft, original);
});

test('rejects reversed AGG prerequisite mapping against compiled Workflow DAG', () => {
  const draft = draftFixture;
  const reversed = [
    { step_id: draft.steps[0].id, task_id: 'standard-qa' },
    { step_id: draft.steps[1].id, task_id: 'standard-engineer' }
  ];
  const report = assessAdaptiveGoalPlanCompatibility(draft, 'standard-engineering', planFor(), reversed);
  assert.equal(report.eligible, false);
  assert.ok(report.blockers.some(item => item.code === 'DEPENDENCY_NOT_PRESERVED'));
  assert.equal(report.gates.dispatchAllowed, false);
});

test('reports missing, duplicate, reused, unknown and malformed task bindings', () => {
  const draft = draftFixture;
  const plan = planFor();
  const missing = assessAdaptiveGoalPlanCompatibility(draft, 'standard-engineering', plan, [
    { step_id: draft.steps[0].id, task_id: 'standard-engineer' }
  ]);
  assert.ok(missing.blockers.some(item => item.code === 'STEP_BINDING_MISSING'));
  const duplicate = assessAdaptiveGoalPlanCompatibility(draft, 'standard-engineering', plan, [
    { step_id: draft.steps[0].id, task_id: 'standard-engineer' },
    { step_id: draft.steps[0].id, task_id: 'standard-qa' }
  ]);
  assert.ok(duplicate.blockers.some(item => item.code === 'STEP_BOUND_MORE_THAN_ONCE'));
  const reused = assessAdaptiveGoalPlanCompatibility(draft, 'standard-engineering', plan, [
    { step_id: draft.steps[0].id, task_id: 'standard-engineer' },
    { step_id: draft.steps[1].id, task_id: 'standard-engineer' }
  ]);
  assert.ok(reused.blockers.some(item => item.code === 'WORKFLOW_TASK_REUSED'));
  const unknown = assessAdaptiveGoalPlanCompatibility(draft, 'standard-engineering', plan, [
    { step_id: 'agg-step-000000000000000000000000', task_id: 'standard-engineer' },
    { step_id: draft.steps[1].id, task_id: 'standard-qa' }
  ]);
  assert.ok(unknown.blockers.some(item => item.code === 'UNKNOWN_DRAFT_STEP'));
  const malformed = assessAdaptiveGoalPlanCompatibility(draft, 'standard-engineering', plan, [{ stepId: draft.steps[0].id, taskId: 'standard-engineer' }]);
  assert.ok(malformed.blockers.some(item => item.code === 'TASK_BINDING_INVALID'));
});

test('requires complete mandatory task mapping only when explicitly requested', () => {
  const draft = draftFixture;
  const partial = assessAdaptiveGoalPlanCompatibility(draft, 'standard-engineering', planFor(), [
    { step_id: draft.steps[0].id, task_id: 'standard-engineer' },
    { step_id: draft.steps[1].id, task_id: 'standard-qa' }
  ], { requireCompleteTaskMapping: true });
  assert.equal(partial.eligible, false);
  assert.ok(partial.blockers.some(item => item.code === 'WORKFLOW_CHILD_TASK_UNMAPPED' && item.taskId === 'standard-platform'));
  assert.equal(partial.gates.workflowProposalCreated, false);
});

test('rejects tampered AGG draft, changed compiled Workflow plan, and unsupported Workflow', () => {
  const plan = planFor();
  const tamperedDraft = { ...draftFixture, goal: { ...draftFixture.goal, label: 'modified' } };
  const draftReport = assessAdaptiveGoalPlanCompatibility(tamperedDraft, 'standard-engineering', plan, bindings());
  assert.ok(draftReport.blockers.some(item => item.code === 'DRAFT_INVALID' && /draftHash/.test(item.message)));
  const { plan_hash: _planHash, ...unsignedPlan } = plan;
  const alteredPlan = { ...unsignedPlan, children: plan.children.map((child, index) => index ? child : { ...child, role: 'untrusted-role' }), plan_hash: plan.plan_hash };
  const planReport = assessAdaptiveGoalPlanCompatibility(draftFixture, 'standard-engineering', alteredPlan, bindings());
  assert.ok(planReport.blockers.some(item => item.code === 'WORKFLOW_PLAN_INVALID' && /plan_hash/.test(item.message)));
  const unsupported = assessAdaptiveGoalPlanCompatibility(draftFixture, 'unknown-workflow', null, bindings());
  assert.ok(unsupported.blockers.some(item => item.code === 'UNSUPPORTED_WORKFLOW'));
  assert.equal(unsupported.workflow.version, null);
});

test('rehashing does not let review gates or executable metadata enter a Plan Graph draft', () => {
  const executable = rehashDraft({
    ...draftFixture,
    steps: draftFixture.steps.map(step => ({ ...step, execution: { ...step.execution, executable: 'node' } }))
  });
  const report = assessAdaptiveGoalPlanCompatibility(executable, 'standard-engineering', planFor(), bindings());
  assert.ok(report.blockers.some(item => item.code === 'DRAFT_INVALID' && /execution metadata/.test(item.message)));
  const dispatchEnabled = rehashDraft({ ...draftFixture, gates: { ...draftFixture.gates, dispatchAllowed: true } });
  const gateReport = assessAdaptiveGoalPlanCompatibility(dispatchEnabled, 'standard-engineering', planFor(), bindings());
  assert.ok(gateReport.blockers.some(item => item.code === 'DRAFT_INVALID' && /gates/.test(item.message)));
});
