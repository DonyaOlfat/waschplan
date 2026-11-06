import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { createSessionToken, hashSessionToken, SESSION_TTL_MS } from '../../lib/session.js';

// Compared when the email is unknown so both login failures run bcrypt once.
const DUMMY_PASSWORD_HASH = '$2b$12$xYhbq/ef1w4bagiOvWzth.dRswi7ASCiSsgGPa.7IcA9yAc3k1qou';

const membershipInclude = {
  membership: {
    include: {
      house: true,
    },
  },
};

export function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    houseSlug: user.membership?.house?.slug ?? null,
    role: user.membership?.role ?? null,
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

export async function loginUser({ email, password }) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: membershipInclude,
  });
  const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const passwordMatches = await verifyPassword(password, passwordHash);

  if (!user || !passwordMatches) {
    throw new AppError('INVALID_CREDENTIALS');
  }

  const token = createSessionToken();

  await prisma.session.create({
    data: {
      id: hashSessionToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return { user: toPublicUser(user), token };
}

export async function getUserBySessionToken(token) {
  if (typeof token !== 'string' || token.length === 0) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { id: hashSessionToken(token) },
    include: { user: { include: membershipInclude } },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  return toPublicUser(session.user);
}

export async function logoutSession(token) {
  if (!token) {
    return;
  }

  await prisma.session.deleteMany({
    where: { id: hashSessionToken(token) },
  });
}
