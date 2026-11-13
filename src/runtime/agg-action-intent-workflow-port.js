/** Versioned read-only host boundary for AGG action-intent evidence binding. Methods return synchronous read snapshots. */
export const AGG_ACTION_INTENT_WORKFLOW_PORT_VERSION = 1;
export const AGG_ACTION_INTENT_WORKFLOW_PORT_KIND = 'agg-action-intent-workflow-port';
export const AGG_ACTION_INTENT_WORKFLOW_PORT_METHODS = Object.freeze([
  'getArtifact',
  'getArtifactStorageRecord',
  'getEvent',
  'getResult',
  'getTask',
  'listArtifactCreatedEvents',
  'listEventsForJob'
]);

export function createAggActionIntentWorkflowPort(implementation) {
  if (!implementation || typeof implementation !== 'object') {
    throw new TypeError('AGG action-intent Workflow Port v1 implementation is required');
  }
  const port = { kind: AGG_ACTION_INTENT_WORKFLOW_PORT_KIND, version: AGG_ACTION_INTENT_WORKFLOW_PORT_VERSION };
  for (const method of AGG_ACTION_INTENT_WORKFLOW_PORT_METHODS) {
    if (typeof implementation[method] !== 'function') {
      throw new TypeError('AGG action-intent Workflow Port v1 must provide ' + method + '()');
    }
    Object.defineProperty(port, method, {
      enumerable: true, configurable: false, writable: false,
      value: implementation[method].bind(implementation)
    });
  }
  return Object.freeze(port);
}

export function assertAggActionIntentWorkflowPort(port) {
  if (!port || port.kind !== AGG_ACTION_INTENT_WORKFLOW_PORT_KIND ||
      port.version !== AGG_ACTION_INTENT_WORKFLOW_PORT_VERSION ||
      !Object.isFrozen(port) ||
      ['db','database','exec','prepare','transaction'].some(key => Object.hasOwn(port,key)) ||
      Object.keys(port).some(key => !['kind','version',...AGG_ACTION_INTENT_WORKFLOW_PORT_METHODS].includes(key))) {
    throw new TypeError('AGG action-intent Workflow Port v1 must be frozen and read-only');
  }
  for (const method of AGG_ACTION_INTENT_WORKFLOW_PORT_METHODS) {
    if (typeof port[method] !== 'function') {
      throw new TypeError('AGG action-intent Workflow Port v1 must provide ' + method + '()');
    }
  }
  return port;
}
