import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../src/version';

const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8')) as { version: string };

describe('APP_VERSION', () => {
  it('is a semantic version like 1.0.0', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('matches the version in package.json', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });
});