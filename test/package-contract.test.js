import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();

async function fileExists(relativePath) {
  await access(path.join(rootDir, relativePath));
}

describe('package contract', () => {
  it('declares the published package entrypoints and files', async () => {
    const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));

    expect(packageJson.name).toBe('codex-supervisor');
    expect(packageJson.type).toBe('module');
    expect(packageJson.main).toBe('dist/index.js');
    expect(packageJson.bin['codex-supervisor']).toBe('dist/index.js');
    expect(packageJson.repository.url).toBe('https://github.com/xukur-munira/Codex_Supervisor');

    await fileExists(packageJson.main);
    await fileExists(packageJson.bin['codex-supervisor']);

    for (const packageFile of packageJson.files) {
      await fileExists(packageFile);
    }
  });

  it('prints CLI help without starting external services', async () => {
    const { stdout } = await execFileAsync(process.execPath, ['dist/index.js', 'help'], {
      cwd: rootDir,
    });

    expect(stdout).toContain('Codex Supervisor - External Supervisor for OpenAI Codex CLI');
    expect(stdout).toContain('codex-supervisor serve');
    expect(stdout).toContain('codex-supervisor run');
  });
});
