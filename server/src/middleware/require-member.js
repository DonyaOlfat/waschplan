import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

export async function requireMember(req, res, next) {
  try {
    const membership = await prisma.membership.findUnique({
      where: { userId: req.user.id },
      include: { house: true },
    });

    if (!membership || membership.house.slug !== req.params.slug) {
      next(new AppError('NOT_FOUND'));
      return;
    }

    req.membership = membership;
    req.house = membership.house;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req, res, next) {
  if (req.membership?.role !== 'ADMIN') {
    next(new AppError('FORBIDDEN'));
    return;
  }

  next();
}
