import { prisma } from '../../src/lib/prisma.js';

const TEST_DATABASE_NAME = 'waschplan_test';

export function assertTestDatabase(databaseName) {
  if (databaseName !== TEST_DATABASE_NAME) {
    throw new Error(`Refusing to reset database "${databaseName}"`);
  }
}

export async function resetDatabase(client = prisma) {
  const [row] = await client.$queryRaw`SELECT current_database()`;

  assertTestDatabase(row.current_database);

  await client.booking.deleteMany();
  await client.session.deleteMany();
  await client.membership.deleteMany();
  await client.machine.deleteMany();
  await client.house.deleteMany();
  await client.user.deleteMany();
}
