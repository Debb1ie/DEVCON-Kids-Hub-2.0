export class ServiceError extends Error {
  constructor(message, code = 'unknown', options = {}) {
    super(message, options);
    this.name = 'ServiceError';
    this.code = code;
  }
}

export const toServiceError = (error, fallback = 'The request could not be completed.') => {
  const message = String(error?.message || '');
  if (/not authorized|permission denied|row-level security|42501/i.test(message)) {
    return new ServiceError('You do not have permission to perform this action.', 'forbidden', { cause: error });
  }
  if (/duplicate|unique|23505/i.test(message)) {
    return new ServiceError('This record already exists.', 'conflict', { cause: error });
  }
  if (/invalid|check constraint|23514|22P02/i.test(message)) {
    return new ServiceError('Some submitted information is invalid.', 'validation', { cause: error });
  }
  return new ServiceError(fallback, 'network_or_server', { cause: error });
};
