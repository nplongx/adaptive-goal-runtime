import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAdaptiveGoalExecutionGraphProposal, verifyAdaptiveGoalExecutionGraphProposalHash } from '../index.js';
import { buildAdaptiveGoalExecutionGraphProposal as subpathBuilder } from '../src/runtime/adaptive-goal-execution-graph-proposal.js';

assert.equal(typeof buildAdaptiveGoalExecutionGraphProposal, 'function');
assert.equal(subpathBuilder, buildAdaptiveGoalExecutionGraphProposal);
assert.equal(typeof verifyAdaptiveGoalExecutionGraphProposalHash, 'function');
const source = fs.readFileSync(new URL('../src/runtime/adaptive-goal-execution-graph-proposal.js', import.meta.url), 'utf8');
assert.match(source, /export function buildAdaptiveGoalExecutionGraphProposal\(/);
assert.doesNotMatch(source, /adaptive-goal-plan-adapter|isAuthenticatedAdaptiveGoalPlanDraft/,
  'the package must not duplicate or import the host WeakMap authentication registry');
assert.match(source, /function verifyReviewOnlyDraft\(draft, isAuthenticatedPlanDraft\)/);
assert.match(source, /typeof isAuthenticatedPlanDraft === 'function' && isAuthenticatedPlanDraft\(draft\) === true/);
assert.match(source, /verifyReviewOnlyDraft\(sourcePlanProposal, isAuthenticatedPlanDraft\)/);
console.log('Adaptive Goal proposal builder export and host-only draft-authentication boundary PASS');
