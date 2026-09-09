import { canPerform } from '../auth/permissions.js';

export class KnowledgeAuthorizationError extends Error {
  constructor() {
    super('You do not have permission to manage knowledge sources.');
    this.name = 'KnowledgeAuthorizationError';
  }
}

export function assertKnowledgeManager(role) {
  if (!canPerform(role, 'knowledge.manage')) throw new KnowledgeAuthorizationError();
}
