import { Prisma } from '@prisma/client';
import { AppError, isAppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { allocateInviteCode } from '../house/invite-code.js';
import { toPublicHouse } from '../house/service.js';

const REGENERATE_ATTEMPTS = 5;

const memberSelect = {
  userId: true,
  houseId: true,
  role: true,
  user: {
    select: {
      name: true,
      email: true,
    },
  },
};

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

export async function updateMemberRole({ houseId, userId, role }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Membership" WHERE "houseId" = ${houseId} FOR UPDATE`;

    const membership = await tx.membership.findUnique({
      where: { userId },
      select: memberSelect,
    });

    if (!membership || membership.houseId !== houseId) {
      throw new AppError('NOT_FOUND');
    }

    if (membership.role === 'ADMIN' && role === 'RESIDENT') {
      const adminCount = await tx.membership.count({
        where: { houseId, role: 'ADMIN' },
      });

      if (adminCount <= 1) {
        throw new AppError('LAST_ADMIN');
      }
    }

    const updated = await tx.membership.update({
      where: { userId },
      data: { role },
      select: memberSelect,
    });

    return toPublicMember(updated);
  });
}

export async function removeMember({ houseId, userId, now }) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Membership" WHERE "houseId" = ${houseId} FOR UPDATE`;

    const membership = await tx.membership.findUnique({ where: { userId } });

    if (!membership || membership.houseId !== houseId) {
      throw new AppError('NOT_FOUND');
    }

    if (membership.role === 'ADMIN') {
      const adminCount = await tx.membership.count({
        where: { houseId, role: 'ADMIN' },
      });

      if (adminCount <= 1) {
        throw new AppError('LAST_ADMIN');
      }
    }

    await tx.booking.deleteMany({
      where: {
        userId,
        startsAt: { gt: now },
        machine: { houseId },
      },
    });

    await tx.membership.delete({ where: { userId } });
  });
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
