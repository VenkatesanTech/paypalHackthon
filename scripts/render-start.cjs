'use strict';

// Render mounts persistent disks only at runtime. Migrate here, not at build time.
const { spawn } = require('node:child_process');
const path = require('node:path');

async function main() {
  if (!process.env.WORKSPACE_PASSWORD?.trim()) {
    throw new Error('WORKSPACE_PASSWORD must be configured before production startup.');
  }
  if (!process.env.DATABASE_URL?.startsWith('file:')) {
    throw new Error('DATABASE_URL must point to a SQLite database.');
  }
  if (process.env.RENDER === 'true' && process.env.DATABASE_URL !== 'file:/var/data/paypilot.db') {
    throw new Error('Render DATABASE_URL must be file:/var/data/paypilot.db on the persistent disk.');
  }
  const origin = new URL(process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || '');
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
    throw new Error('APP_URL or RENDER_EXTERNAL_URL must be the public HTTPS origin.');
  }
  process.env.APP_URL = origin.origin;
  const port = process.env.PORT || '10000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('PORT must be a valid TCP port.');
  }

  let activeChild;
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => activeChild?.kill(signal));
  }
  const run = (entry, args) => new Promise((resolve, reject) => {
    activeChild = spawn(process.execPath, [entry, ...args], { stdio: 'inherit', env: process.env });
    activeChild.once('error', reject);
    activeChild.once('exit', (code, signal) => {
      activeChild = undefined;
      if (signal) return reject(new Error(`Process terminated by ${signal}.`));
      if (code !== 0) return reject(new Error(`Process exited with code ${code}.`));
      resolve();
    });
  });
  const root = path.resolve(__dirname, '..');
  await run(require.resolve('prisma/build/index.js', { paths: [root] }), ['migrate', 'deploy']);
  await run(require.resolve('next/dist/bin/next', { paths: [root] }), ['start', '--hostname', '0.0.0.0', '--port', port]);
}

main().catch(() => {
  // Never echo environment values or provider credentials in deployment errors.
  console.error('Render startup failed. Check the configured database path, public HTTPS origin, workspace password, and the migration/start logs.');
  process.exitCode = 1;
});
