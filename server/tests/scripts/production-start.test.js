import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '../../package.json');
const serverPackage = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

describe('production start script', () => {
  it('migrates and then starts the server without an env file', () => {
    expect(serverPackage.scripts['start:prod']).toBe('prisma migrate deploy && node src/server.js');
    expect(serverPackage.scripts['start:prod']).not.toContain('--env-file');
  });

  it('keeps the optional env file on dev and start', () => {
    expect(serverPackage.scripts.dev).toBe('node --watch --env-file-if-exists=.env src/server.js');
    expect(serverPackage.scripts.start).toBe('node --env-file-if-exists=.env src/server.js');
  });

  it('ships the prisma cli as a dependency', () => {
    expect(serverPackage.dependencies.prisma).toBe('^6.19.3');
    expect(serverPackage.devDependencies).not.toHaveProperty('prisma');
    expect(serverPackage.dependencies['@prisma/client']).toBe('^6.19.3');
  });
});
