import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import { prisma } from '../src/lib/prisma.js';

const DEMO_PASSWORD = 'waschplan';
const BCRYPT_COST = 12;

const HOUSE = {
  name: 'Wittensteinstraße 12',
  slug: 'wittensteinstr-12',
  inviteCode: 'WUPP42',
};

const USERS = [
  { name: 'Lena', email: 'lena@wittensteinstr.example', role: 'ADMIN' },
  { name: 'Jonas', email: 'jonas@wittensteinstr.example', role: 'RESIDENT' },
  { name: 'Mira', email: 'mira@wittensteinstr.example', role: 'RESIDENT' },
  { name: 'Paul', email: 'paul@wittensteinstr.example', role: 'RESIDENT' },
];

const MACHINES = [
  { name: 'Waschmaschine 1', type: 'WASHER' },
  { name: 'Waschmaschine 2', type: 'WASHER' },
  { name: 'Trockner', type: 'DRYER' },
];

export async function seed(client = prisma) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST);

  const house = await client.house.upsert({
    where: { slug: HOUSE.slug },
    update: {
      name: HOUSE.name,
      inviteCode: HOUSE.inviteCode,
    },
    create: {
      name: HOUSE.name,
      slug: HOUSE.slug,
      inviteCode: HOUSE.inviteCode,
    },
  });

  for (const person of USERS) {
    const user = await client.user.upsert({
      where: { email: person.email },
      update: {
        name: person.name,
        passwordHash,
      },
      create: {
        name: person.name,
        email: person.email,
        passwordHash,
      },
    });

    await client.membership.upsert({
      where: { userId: user.id },
      update: {
        houseId: house.id,
        role: person.role,
      },
      create: {
        userId: user.id,
        houseId: house.id,
        role: person.role,
      },
    });
  }

  for (const machine of MACHINES) {
    await client.machine.upsert({
      where: {
        houseId_name: {
          houseId: house.id,
          name: machine.name,
        },
      },
      update: {
        type: machine.type,
        isBroken: false,
      },
      create: {
        houseId: house.id,
        name: machine.name,
        type: machine.type,
        isBroken: false,
      },
    });
  }

  return {
    house: {
      name: house.name,
      slug: house.slug,
      inviteCode: house.inviteCode,
    },
    userCount: USERS.length,
    machineCount: MACHINES.length,
  };
}

function isRunAsScript() {
  const entry = process.argv[1];

  if (!entry) {
    return false;
  }

  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isRunAsScript()) {
  try {
    const result = await seed();
    console.log(
      `Seeded house ${result.house.slug} (invite ${result.house.inviteCode}) with ${result.userCount} residents and ${result.machineCount} machines.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
