import { testDatabaseUrl } from './helpers/database-url.js';

export async function teardown() {
  process.env.DATABASE_URL = testDatabaseUrl;

  const { prisma } = await import('../src/lib/prisma.js');

  await prisma.$disconnect();
}
