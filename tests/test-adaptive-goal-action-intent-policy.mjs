import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADAPTIVE_GOAL_ACTION_INTENT_SEMANTIC_POLICY_VERSION,
  getAdaptiveGoalActionIntentSemanticPolicy,
  canonicalAdaptiveGoalActionIntentDescription,
  buildAdaptiveGoalActionIntentSemanticVerification,
  validateCompiledAdaptiveGoalActionIntentSemanticVerification
} from '../index.js';

const completionCriteria = [
  'approved_scope_implemented',
  'implementation_evidence_recorded',
  'tests_or_verification_run'
];
const roleContract = Object.freeze({
  id: 'agent.engineer', version: 1, role: 'engineer', capability: 'code.modify',
  outputs: ['implementation'], completionCriteria
});
const node = {
  sourceStepId: 'agg-step-0123456789abcdef01234567',
  supportingEvidence: { artifacts: [{ artifactId: 'artifact-req-01', type: 'requirements' }] }
};
const normalizedInputs = [{
  inputType: 'requirements', source: { kind: 'evidence' },
  provenance: { artifactId: 'artifact-req-01' }
}];
const intent = {
  operation: 'implement',
  target: { kind: 'artifact', reference: 'artifact-req-01' },
  successCriteria: [...completionCriteria].sort()
};
intent.description = canonicalAdaptiveGoalActionIntentDescription({
  operation: intent.operation, target: intent.target,
  outputArtifactType: 'implementation', successCriteria: intent.successCriteria
});
const build = (overrides = {}) => buildAdaptiveGoalActionIntentSemanticVerification({
  role: 'engineer', capability: 'code.modify', roleContract, outputArtifactType: 'implementation',
  node, intent, normalizedInputs, dependencies: ['agg-step-ancestor'], ...overrides
});

test('role semantic policies are versioned, closed and immutable', () => {
  assert.equal(ADAPTIVE_GOAL_ACTION_INTENT_SEMANTIC_POLICY_VERSION, 1);
  const policy = getAdaptiveGoalActionIntentSemanticPolicy('ENGINEER');
  assert.deepEqual({ role: policy.role, operation: policy.operation, targetKinds: policy.targetKinds, outputArtifactType: policy.outputArtifactType }, {
    role: 'engineer', operation: 'implement', targetKinds: ['artifact', 'work_item'], outputArtifactType: 'implementation'
  });
  assert.ok(Object.isFrozen(policy));
  assert.ok(Object.isFrozen(policy.targetKinds));
  assert.throws(() => getAdaptiveGoalActionIntentSemanticPolicy('custom'), { code: 'AGG_ACTION_INTENT_ROLE_SEMANTIC_POLICY_MISSING' });
});

test('semantic proof binds operation, exact evidence target, role contract, input and dependencies', () => {
  const proof = build();
  assert.equal(proof.schema_version, 1);
  assert.equal(proof.policy_id, 'agg.action-intent.semantic.engineer');
  assert.deepEqual(proof.target_binding, {
    kind: 'evidence_artifact', artifact_id: 'artifact-req-01', artifact_type: 'requirements', input_type: 'requirements'
  });
  assert.deepEqual(proof.input_types, ['requirements']);
  assert.deepEqual(proof.dependency_step_ids, ['agg-step-ancestor']);
  assert.match(proof.semantic_hash, /^[a-f0-9]{64}$/);
});

test('semantic proof rejects capability, operation, target and description drift', () => {
  assert.throws(() => build({ capability: 'security.audit' }), { code: 'AGG_ACTION_INTENT_ROLE_CAPABILITY_MISMATCH' });
  assert.throws(() => build({ intent: { ...intent, operation: 'review' } }), { code: 'AGG_ACTION_INTENT_ROLE_SEMANTIC_MISMATCH' });
  assert.throws(() => build({ intent: { ...intent, target: { kind: 'codebase', reference: 'src' } } }), { code: 'AGG_ACTION_INTENT_TARGET_SEMANTICS_UNSUPPORTED' });
  assert.throws(() => build({ intent: { ...intent, description: 'free form' } }), { code: 'AGG_ACTION_INTENT_DESCRIPTION_NOT_CANONICAL' });
  assert.throws(() => build({ node: { sourceStepId: node.sourceStepId, supportingEvidence: { artifacts: [] } } }), { code: 'AGG_ACTION_INTENT_TARGET_UNBOUND' });
});

test('compiled semantic proof validator accepts exact proof and rejects altered hash or input binding', () => {
  const proof = build();
  const compiled = {
    operation: intent.operation, target: intent.target, description: intent.description,
    source_step_id: node.sourceStepId,
    role_contract_id: roleContract.id, role_contract_version: roleContract.version,
    dependency_step_ids: ['agg-step-ancestor'], task_input_bindings: [{
      input_type: 'requirements', source: { kind: 'evidence', artifact_id: 'artifact-req-01' }
    }],
    semantic_verification: proof
  };
  assert.equal(validateCompiledAdaptiveGoalActionIntentSemanticVerification('engineer', compiled, 'compile-task-01'), true);
  const changedHash = structuredClone(compiled);
  changedHash.semantic_verification.semantic_hash = '0'.repeat(64);
  assert.throws(() => validateCompiledAdaptiveGoalActionIntentSemanticVerification('engineer', changedHash, 'compile-task-01'), {
    code: 'AGG_ACTION_INTENT_SEMANTIC_PROOF_INVALID'
  });
  const changedBinding = structuredClone(compiled);
  changedBinding.task_input_bindings[0].source.artifact_id = 'artifact-other';
  assert.throws(() => validateCompiledAdaptiveGoalActionIntentSemanticVerification('engineer', changedBinding, 'compile-task-01'), {
    code: 'AGG_ACTION_INTENT_SEMANTIC_PROOF_INVALID'
  });
});
