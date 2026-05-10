import { access, copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

async function pathExists(relativePath) {
  try {
    await access(path.join(rootDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function copyIfSourceExists(source, target) {
  if (!(await pathExists(source))) {
    return false;
  }

  const targetPath = path.join(rootDir, target);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(path.join(rootDir, source), targetPath);
  return true;
}

async function assertPathExists(relativePath) {
  if (!(await pathExists(relativePath))) {
    throw new Error(`Required package file is missing: ${relativePath}`);
  }
}

async function readPackageJson() {
  const packageText = await readFile(path.join(rootDir, 'package.json'), 'utf8');
  return JSON.parse(packageText);
}

async function main() {
  const staticCopies = [
    {
      source: 'src/web/agent-visualizer.html',
      target: 'dist/web/agent-visualizer.html',
    },
  ];

  for (const { source, target } of staticCopies) {
    const copied = await copyIfSourceExists(source, target);
    if (!copied) {
      await assertPathExists(target);
    }
  }

  const packageJson = await readPackageJson();
  const packageFiles = Array.isArray(packageJson.files) ? packageJson.files : [];
  const requiredFiles = [packageJson.main, packageJson.bin?.['codex-supervisor'], ...packageFiles]
    .filter(Boolean)
    .map((entry) => String(entry).replace(/^\.\//, ''));

  for (const requiredFile of requiredFiles) {
    await assertPathExists(requiredFile);
  }

  console.log('Static package files validated.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
