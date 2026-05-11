import { rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const apiDir = path.join(root, 'app', 'api');
const apiBackupDir = path.join(root, 'app', '_api_dev');
const outDir = path.join(root, 'out');
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');

async function moveIfExists(from, to) {
  try {
    await rename(from, to);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

const apiMoved = await moveIfExists(apiDir, apiBackupDir);

try {
  await rm(outDir, { recursive: true, force: true });

  const child = spawn(
    process.execPath,
    [nextBin, 'build', '--webpack'],
    {
      cwd: root,
      env: {
        ...process.env,
        NEXT_PUBLIC_DEPLOY_TARGET: 'web4',
        NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PERSISTENCE:
          process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PERSISTENCE ?? 'true',
        NEXT_PUBLIC_STORAGE_API_URL:
          process.env.NEXT_PUBLIC_STORAGE_API_URL ?? 'https://youtick-storage-api.araafatsum.workers.dev',
        NEXT_PUBLIC_ENABLE_MEDIA_DELIVERY_WORKER:
          process.env.NEXT_PUBLIC_ENABLE_MEDIA_DELIVERY_WORKER ?? 'true',
        NEXT_PUBLIC_MEDIA_DELIVERY_URL:
          process.env.NEXT_PUBLIC_MEDIA_DELIVERY_URL ?? 'https://youtick-media-delivery.araafatsum.workers.dev',
      },
      stdio: 'inherit',
    },
  );

  const exitCode = await new Promise((resolve, reject) => {
    child.on('exit', resolve);
    child.on('error', reject);
  });

  if (exitCode !== 0) {
    process.exitCode = exitCode ?? 1;
  }
} finally {
  if (apiMoved) {
    await moveIfExists(apiBackupDir, apiDir);
  }
}
