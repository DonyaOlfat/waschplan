import { Prisma } from '@prisma/client';
import { AppError, isAppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { allocateInviteCode } from '../house/invite-code.js';
import { toPublicHouse } from '../house/service.js';

const REGENERATE_ATTEMPTS = 5;

export function toPublicMember(membership) {
  return {
    userId: membership.userId,
    name: membership.user.name,
    email: membership.user.email,
    role: membership.role,
  };
}

export async function listMembers(houseId) {
  const memberships = await prisma.membership.findMany({
    where: { houseId },
    orderBy: [{ createdAt: 'asc' }, { user: { name: 'asc' } }],
    select: {
      userId: true,
      role: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  return memberships.map(toPublicMember);
}

export async function regenerateInviteCode({ houseId }) {
  for (let attempt = 0; attempt < REGENERATE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const inviteCode = await allocateInviteCode(tx);
        const house = await tx.house.update({
          where: { id: houseId },
          data: { inviteCode },
        });

        return toPublicHouse(house, 'ADMIN');
      });
    } catch (error) {
      if (isAppError(error)) {
        throw error;
      }

      if (isInviteCodeConflict(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new AppError('CONFLICT');
}

function isInviteCodeConflict(error) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }

  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.length === 0 || target.some((field) => String(field).includes('inviteCode'));
  }

  if (typeof target === 'string') {
    return target.includes('inviteCode');
  }

  return true;
}
