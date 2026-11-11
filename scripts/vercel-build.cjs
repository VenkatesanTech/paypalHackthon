'use strict';

const { spawnSync } = require('node:child_process');
const root = require('node:path').resolve(__dirname, '..');
const schema = 'prisma/postgresql/schema.prisma';
// Neon Marketplace injects the unpooled URL under this name.
process.env.DIRECT_URL ||= process.env.DATABASE_URL_UNPOOLED;

function run(entry, args) {
  const result = spawnSync(process.execPath, [require.resolve(entry, { paths: [root] }), ...args], {
    cwd: root, stdio: 'inherit', env: process.env,
  });
  if (result.error || result.status !== 0) {
    console.error('Vercel build step failed. Review the preceding build logs.');
    process.exit(result.status || 1);
  }
}

for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
  try {
    const value = new URL(process.env[key] || '');
    if (!['postgres:', 'postgresql:'].includes(value.protocol)) throw new Error();
  } catch {
    console.error(`Set ${key} to the hosted PostgreSQL connection URL before building on Vercel.`);
    process.exit(1);
  }
}
if (!process.env.WORKSPACE_PASSWORD?.trim()) {
  console.error('Set WORKSPACE_PASSWORD before deploying the owner workspace.');
  process.exit(1);
}
run('prisma/build/index.js', ['generate', '--schema', schema]);
// Preview deployments must use their own database branch, never migrate production.
if (process.env.VERCEL_ENV === 'production') {
  run('prisma/build/index.js', ['migrate', 'deploy', '--schema', schema]);
}
run('next/dist/bin/next', ['build']);
