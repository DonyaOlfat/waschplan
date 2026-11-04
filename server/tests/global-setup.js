import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { testDatabaseUrl } from './helpers/database-url.js';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function setup() {
  process.env.DATABASE_URL = testDatabaseUrl;

  const prismaCli = require.resolve('prisma/build/index.js');

  await execFileAsync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: serverRoot,
    env: process.env,
    stdio: 'inherit',
  });
}

export { teardown } from './global-teardown.js';
