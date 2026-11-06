import { Prisma } from '@prisma/client';
import { AppError, isAppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { allocateInviteCode } from './invite-code.js';
import { allocateSlug, slugifyHouseName } from './slug.js';

const CREATE_ATTEMPTS = 5;

export function toPublicHouse(house, role) {
  return {
    id: house.id,
    name: house.name,
    slug: house.slug,
    inviteCode: house.inviteCode,
    role,
    createdAt: house.createdAt,
  };
}

export async function createHouse({ userId, name }) {
  if (slugifyHouseName(name) === '') {
    throw new AppError('VALIDATION_ERROR', 'Name must contain a letter or number.');
  }

  const existing = await prisma.membership.findUnique({ where: { userId } });

  if (existing) {
    throw new AppError('ALREADY_IN_HOUSE');
  }

  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const membership = await tx.membership.findUnique({ where: { userId } });

        if (membership) {
          throw new AppError('ALREADY_IN_HOUSE');
        }

        const slug = await allocateSlug(tx, name);
        const inviteCode = await allocateInviteCode(tx);
        const house = await tx.house.create({
          data: {
            name,
            slug,
            inviteCode,
            memberships: {
              create: { userId, role: 'ADMIN' },
            },
          },
        });

        return toPublicHouse(house, 'ADMIN');
      });
    } catch (error) {
      if (isAppError(error)) {
        throw error;
      }

      const fields = uniqueFields(error);

      if (!fields) {
        throw error;
      }

      if (fields.some((field) => field.includes('userId'))) {
        throw new AppError('ALREADY_IN_HOUSE');
      }

      if (
        fields.length === 0 ||
        fields.some((field) => field.includes('slug') || field.includes('inviteCode'))
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new AppError('CONFLICT');
}

export async function joinHouse({ userId, inviteCode }) {
  const existing = await prisma.membership.findUnique({ where: { userId } });

  if (existing) {
    throw new AppError('ALREADY_IN_HOUSE');
  }

  const house = await prisma.house.findUnique({ where: { inviteCode } });

  if (!house) {
    throw new AppError('INVALID_INVITE_CODE');
  }

  try {
    await prisma.$transaction(async (tx) => {
      const membership = await tx.membership.findUnique({ where: { userId } });

      if (membership) {
        throw new AppError('ALREADY_IN_HOUSE');
      }

      await tx.membership.create({
        data: {
          userId,
          houseId: house.id,
          role: 'RESIDENT',
        },
      });
    });
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }

    const fields = uniqueFields(error);

    if (fields?.some((field) => field.includes('userId'))) {
      throw new AppError('ALREADY_IN_HOUSE');
    }

    throw error;
  }

  return toPublicHouse(house, 'RESIDENT');
}

export async function leaveHouse({ userId, houseId }) {
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

    const now = new Date();

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

function uniqueFields(error) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return null;
  }

  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.map(String);
  }

  if (typeof target === 'string') {
    return [target];
  }

  return [];
}
