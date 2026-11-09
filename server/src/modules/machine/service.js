import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

export function toPublicMachine(machine) {
  return {
    id: machine.id,
    name: machine.name,
    type: machine.type,
    isBroken: machine.isBroken,
    createdAt: machine.createdAt,
  };
}

export async function listMachines(houseId) {
  const machines = await prisma.machine.findMany({
    where: { houseId },
    orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
  });

  return machines.map(toPublicMachine);
}

export async function createMachine({ houseId, name, type }) {
  try {
    const machine = await prisma.machine.create({
      data: { houseId, name, type },
    });

    return toPublicMachine(machine);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('MACHINE_NAME_TAKEN');
    }

    throw error;
  }
}

export async function renameMachine({ houseId, machineId, name }) {
  const existing = await prisma.machine.findFirst({
    where: { id: machineId, houseId },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND');
  }

  try {
    const machine = await prisma.machine.update({
      where: { id: existing.id },
      data: { name },
    });

    return toPublicMachine(machine);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('MACHINE_NAME_TAKEN');
    }

    throw error;
  }
}

export async function setMachineBroken({ houseId, machineId, isBroken, now }) {
  const machine = await prisma.$transaction(async (tx) => {
    const existing = await tx.machine.findFirst({
      where: { id: machineId, houseId },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND');
    }

    const updated = await tx.machine.update({
      where: { id: existing.id },
      data: { isBroken },
    });

    if (isBroken) {
      await tx.booking.updateMany({
        where: {
          machineId: existing.id,
          status: 'ACTIVE',
          startsAt: { gt: now },
        },
        data: { status: 'AFFECTED' },
      });
    } else {
      await tx.booking.updateMany({
        where: {
          machineId: existing.id,
          status: 'AFFECTED',
          startsAt: { gt: now },
        },
        data: { status: 'ACTIVE' },
      });
    }

    return updated;
  });

  return toPublicMachine(machine);
}

export async function deleteMachine({ houseId, machineId }) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.machine.findFirst({
      where: { id: machineId, houseId },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND');
    }

    await tx.booking.deleteMany({
      where: { machineId: existing.id },
    });

    await tx.machine.delete({
      where: { id: existing.id },
    });
  });
}
