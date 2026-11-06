export const errorCodes = {
  VALIDATION_ERROR: { status: 400, message: 'Invalid input.' },
  NOT_FOUND: { status: 404, message: 'Not found.' },
  INVALID_INVITE_CODE: { status: 404, message: 'This invite code is not valid.' },
  CONFLICT: { status: 409, message: 'This conflicts with existing data.' },
  ALREADY_IN_HOUSE: { status: 409, message: 'You are already in a house.' },
  EMAIL_TAKEN: { status: 409, message: 'An account with this email already exists.' },
  INVALID_CREDENTIALS: { status: 401, message: 'Email or password is incorrect.' },
  UNAUTHENTICATED: { status: 401, message: 'You need to log in.' },
  TOO_MANY_REQUESTS: { status: 429, message: 'Too many login attempts. Try again later.' },
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
