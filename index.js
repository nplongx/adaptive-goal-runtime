import {
  createAdaptiveGoalActionIntentBindingResolver as createResolver
} from './src/runtime/adaptive-goal-action-intent-binding-resolver.js';
import {
  AGG_ACTION_INTENT_WORKFLOW_PORT_VERSION,
  AGG_ACTION_INTENT_WORKFLOW_PORT_KIND,
  AGG_ACTION_INTENT_WORKFLOW_PORT_METHODS,
  createAggActionIntentWorkflowPort,
  assertAggActionIntentWorkflowPort
} from './src/runtime/agg-action-intent-workflow-port.js';

export * from './src/runtime/adaptive-goal-action-intent-binding-resolver.js';
export * from './src/runtime/agg-action-intent-workflow-port.js';

export function createAdaptiveGoalActionIntentBindingResolver(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('AGG action-intent resolver options must be an object');
  }
  const workflowPort = options.workflowPort?.kind === AGG_ACTION_INTENT_WORKFLOW_PORT_KIND
    ? assertAggActionIntentWorkflowPort(options.workflowPort)
    : createAggActionIntentWorkflowPort(options.workflowPort);
  return createResolver({ ...options, workflowPort });
}

export * from './src/runtime/adaptive-goal-action-intent-policy.js';
