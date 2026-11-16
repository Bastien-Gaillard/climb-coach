import { Controller, Get } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Public } from './auth/auth.decorators';

/**
 * Version déployée : le dernier commit (« b4f66d2 · 16/11/2026 16:20 »), écrit dans version.txt
 * par le Dockerfile. Hors Docker, le fichier n'existe pas : « dev ».
 */
export function readVersion(dir = process.cwd()): string {
  try {
    return readFileSync(join(dir, 'version.txt'), 'utf8').trim() || 'dev';
  } catch {
    return 'dev';
  }
}

@Public()
@Controller('health')
export class HealthController {
  private readonly version = readVersion();

  @Get()
  check() {
    return { status: 'ok', version: this.version };
  }
}
