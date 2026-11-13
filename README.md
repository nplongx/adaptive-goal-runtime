# Adaptive Goal Runtime

`@runalith/adaptive-goal-runtime` is the AGG-owned, read-only application slice for resolving persisted reviewed action-intent bindings against current Workflow evidence.

## Scope

The package owns pure Plan Graph to compiled Workflow compatibility assessment (strict draft integrity, compiled-plan DAG integrity, explicit step/task mapping, prerequisite preservation and mandatory-task coverage), plus AGG action-intent semantics for built-in roles (canonical operation, allowed target kinds, output type, completion criteria and canonical description), validates compiled semantic proofs/fingerprints, interprets one canonical `adaptive_goal.execution_plan_candidate_created` event, verifies the persisted candidate through an injected AGG verifier, checks compiler-binding hashes, binds evidence to current Workflow artifact/task/result/completion records, and invokes an injected reviewer-attestation verifier. It returns the exact typed action-intent bindings or fails closed.

It does **not** own a database, SQL, transactions, event writes, trust roots, signature custody, reviewer identity, Workflow approval, plan mutation, dispatch, or execution. All Workflow access arrives through the frozen, versioned **Workflow Port v1**. Port methods are synchronous and return bounded read snapshots; asynchronous methods are rejected by the resolver. Candidate-hash and reviewer-attestation verifiers are injected by the host. The package cannot authorize execution by itself.

## Install and test

Node.js `>=22.13.0`.

```sh
npm ci
npm run check
npm run pack:check
npm run test:packed-consumer
```

## Public API

```js
import {
  assessAdaptiveGoalPlanCompatibility,
  ADAPTIVE_GOAL_COMPATIBLE_WORKFLOW_IDS,
  assessAdaptiveGoalPlanCompatibility,
  createAdaptiveGoalActionIntentBindingResolver,
  getAdaptiveGoalActionIntentSemanticPolicy,
  canonicalAdaptiveGoalActionIntentDescription,
  buildAdaptiveGoalActionIntentSemanticVerification,
  validateCompiledAdaptiveGoalActionIntentSemanticVerification,
  createAggActionIntentWorkflowPort,
  assertAggActionIntentWorkflowPort,
  AGG_ACTION_INTENT_WORKFLOW_PORT_VERSION,
  AGG_ACTION_INTENT_WORKFLOW_PORT_METHODS
} from '@runalith/adaptive-goal-runtime';
```

`./plan-compatibility` exposes the pure Plan Graph to compiled Workflow compatibility assessment. It is report-only and always keeps proposal creation, immutable-plan creation, human review, Workflow approval, dispatch and execution authorization separate. `./action-intent-policy` exposes the pure role-semantic policy, canonical description, semantic-proof builder and compiled-proof validator. `createAggActionIntentWorkflowPort(implementation)` accepts only the named read methods in `AGG_ACTION_INTENT_WORKFLOW_PORT_METHODS`, binds them to the supplied implementation, freezes the resulting port, and rejects any attempt to expose a DB/transaction surface. The resolver additionally requires host-supplied candidate-hash and reviewer-attestation verifiers.

Legacy host import path remains a compatibility facade; canonical implementation lives in this repository.

## Compatibility

Package version `0.1.0` is experimental. Host consumes immutable Git commit archives; npm publication and stable `1.x` compatibility are not implied.
