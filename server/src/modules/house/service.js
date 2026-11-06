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
