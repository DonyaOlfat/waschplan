export const errorCodes = {
  VALIDATION_ERROR: { status: 400, message: 'Invalid input.' },
  NOT_FOUND: { status: 404, message: 'Not found.' },
  CONFLICT: { status: 409, message: 'This conflicts with existing data.' },
  EMAIL_TAKEN: { status: 409, message: 'An account with this email already exists.' },
  INTERNAL_ERROR: { status: 500, message: 'Something went wrong.' },
};

export class AppError extends Error {
  constructor(code, message) {
    const entry = errorCodes[code];

    if (!entry) {
      throw new Error(`Unknown error code: ${code}`);
    }

    super(message ?? entry.message);
    this.name = 'AppError';
    this.code = code;
    this.status = entry.status;
  }
}

export function isAppError(error) {
  return error instanceof AppError;
}
