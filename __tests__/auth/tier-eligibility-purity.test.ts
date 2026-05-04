/**
 * Purity guard for lib/auth/tier-eligibility.
 *
 * The helper MUST stay sync and pure (args-only). It is called from hot paths
 * (priority routing, request handlers) and from React Server Components where
 * an accidental `await` would force everything async or trigger Suspense.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SOURCE_PATH = join(process.cwd(), 'lib/auth/tier-eligibility.ts');

describe('tier-eligibility purity guard', () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(SOURCE_PATH, 'utf8');
  });

  it('contains no `await` keyword', () => {
    // Strip comments before checking, so doc references to "await" don't trip the guard.
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/\bawait\b/);
  });

  it('contains no `async` keyword', () => {
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/\basync\b/);
  });

  it('imports nothing from prisma, fs, or fetch-bearing modules', () => {
    expect(source).not.toMatch(/from ['"]@\/lib\/db\/prisma['"]/);
    expect(source).not.toMatch(/from ['"]fs['"]/);
    expect(source).not.toMatch(/from ['"]node:fs['"]/);
    expect(source).not.toMatch(/\bfetch\(/);
  });
});
