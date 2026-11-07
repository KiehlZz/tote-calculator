import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const text = readFileSync(resolve(__dirname, '..', '.github', 'workflows', 'deploy.yml'), 'utf8').replace(
  /\r\n/g,
  '\n',
);

const deployStart = text.indexOf('\n  deploy:\n');
const deploy = text.slice(deployStart);

describe('deploy workflow', () => {
  it('runs on pushes to main and can be started by hand', () => {
    expect(text).toMatch(/push:\s*\n\s*branches: \[main\]/);
    expect(text).toContain('workflow_dispatch:');
  });

  it('installs, runs the full check, and only then uploads dist', () => {
    const install = text.indexOf('npm ci');
    const check = text.indexOf('npm run check:pages');
    const upload = text.indexOf('actions/upload-pages-artifact');
    expect(install).toBeGreaterThan(-1);
    expect(install).toBeLessThan(check);
    expect(check).toBeLessThan(upload);
    expect(text).toMatch(/path: dist\b/);
  });

  it('finds the deploy job', () => {
    expect(deployStart).toBeGreaterThan(-1);
    expect(deploy).toContain('actions/deploy-pages');
  });

  it('makes the deploy job wait for the build job', () => {
    expect(deploy).toMatch(/needs: build\b/);
  });

  it('gives the deploy job the permissions Pages requires', () => {
    expect(deploy).toMatch(/pages: write/);
    expect(deploy).toMatch(/id-token: write/);
  });

  it('deploys through the github-pages environment', () => {
    expect(deploy).toMatch(/environment:\s*\n\s*name: github-pages/);
  });
});