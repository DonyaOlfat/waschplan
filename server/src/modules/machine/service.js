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
