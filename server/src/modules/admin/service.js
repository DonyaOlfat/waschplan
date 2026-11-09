import { prisma } from '../../lib/prisma.js';

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
