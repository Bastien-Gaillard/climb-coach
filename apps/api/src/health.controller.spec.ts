import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HealthController, readVersion } from './health.controller';

describe('version de l’appli', () => {
  it('lit le commit écrit par le Dockerfile', () => {
    const dir = mkdtempSync(join(tmpdir(), 'version-'));
    writeFileSync(join(dir, 'version.txt'), 'b4f66d2 · 16/11/2026 16:20\n');
    expect(readVersion(dir)).toBe('b4f66d2 · 16/11/2026 16:20');
  });

  it('« dev » sans fichier ou avec un fichier vide', () => {
    const dir = mkdtempSync(join(tmpdir(), 'version-'));
    expect(readVersion(dir)).toBe('dev');
    writeFileSync(join(dir, 'version.txt'), '\n');
    expect(readVersion(dir)).toBe('dev');
  });

  it('GET /health donne la version', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok', version: 'dev' });
  });
});
