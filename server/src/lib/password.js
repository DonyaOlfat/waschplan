import bcrypt from 'bcrypt';

export const BCRYPT_COST = 12;

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}
