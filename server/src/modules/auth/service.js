import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';

export function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    houseSlug: null,
    role: null,
  };
}

export async function registerUser({ email, name, password }) {
  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.create({
      data: { email, name, passwordHash },
    });

    return toPublicUser(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('EMAIL_TAKEN');
    }

    throw error;
  }
}
