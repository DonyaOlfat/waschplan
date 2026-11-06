import { randomInt as cryptoRandomInt } from 'node:crypto';

export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const INVITE_CODE_LENGTH = 6;
const MAX_INVITE_ATTEMPTS = 5;

export function generateInviteCode(randomInt = (max) => cryptoRandomInt(max)) {
  let code = '';

  for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
    code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  }

  return code;
}

export async function allocateInviteCode(tx, randomInt) {
  for (let attempt = 0; attempt < MAX_INVITE_ATTEMPTS; attempt += 1) {
    const inviteCode = generateInviteCode(randomInt);
    const existing = await tx.house.findUnique({ where: { inviteCode } });

    if (!existing) {
      return inviteCode;
    }
  }

  throw new Error('Could not allocate an invite code.');
}
