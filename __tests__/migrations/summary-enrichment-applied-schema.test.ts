/**
 * Static schema regression guard for the `Summary.enrichmentApplied` column.
 *
 * Phase 2 of `tasks/x-search-max-only.md` adds a boolean column to drive the
 * tier-aware shared cache lookup (Phase 4). The column has no readers/writers
 * yet, so a future contributor could plausibly delete it during a "tidy up
 * schema" pass without realizing it's load-bearing for an unshipped feature.
 *
 * This test reads `prisma/schema.prisma` directly (no DB) and asserts:
 *   1. The column is declared on `model Summary` with `@default(false)`.
 *   2. The 3-col cache index `[filingUrl, filingType, enrichmentApplied]` exists.
 *   3. The legacy 2-col index `[filingUrl, filingType]` has been removed
 *      (replaced, not added alongside — duplicate indexes waste write throughput).
 *   4. The Prisma migration file for the column exists with the correct SQL.
 *   5. The post-deploy index swap SQL file exists and uses CONCURRENTLY.
 *
 * If any of these break, the failure message points at the PR that needs review.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const SCHEMA_PATH = path.join(__dirname, '../../prisma/schema.prisma');
const COLUMN_MIGRATION_PATH = path.join(
  __dirname,
  '../../prisma/migrations/20260429101542_add_summary_enrichment_applied/migration.sql'
);
const INDEX_SWAP_SQL_PATH = path.join(
  __dirname,
  '../../prisma/migrations/add_enrichment_applied_index.sql'
);

function readSchema(): string {
  return fs.readFileSync(SCHEMA_PATH, 'utf-8');
}

function summaryModelBlock(schema: string): string {
  // Match `model Summary { ... }` non-greedily, including the closing brace.
  const match = schema.match(/model\s+Summary\s*{[\s\S]*?\n}/);
  if (!match) throw new Error('model Summary not found in schema.prisma');
  return match[0];
}

describe('Summary.enrichmentApplied schema regression', () => {
  describe('schema.prisma', () => {
    it('declares enrichmentApplied as Boolean with @default(false)', () => {
      const block = summaryModelBlock(readSchema());
      expect(block).toMatch(/enrichmentApplied\s+Boolean\s+@default\(false\)/);
    });

    it('declares the 3-col cache index [filingUrl, filingType, enrichmentApplied]', () => {
      const block = summaryModelBlock(readSchema());
      expect(block).toMatch(
        /@@index\(\[filingUrl,\s*filingType,\s*enrichmentApplied\]\)/
      );
    });

    it('does NOT declare the legacy 2-col [filingUrl, filingType] index', () => {
      const block = summaryModelBlock(readSchema());
      // The 3-col index contains "filingUrl, filingType" as a prefix, so we need
      // a strict check: an @@index whose argument list ends right after filingType.
      const legacyMatch = block.match(/@@index\(\[filingUrl,\s*filingType\]\)/);
      expect(legacyMatch).toBeNull();
    });
  });

  describe('column-add migration', () => {
    it('exists at the expected path', () => {
      expect(fs.existsSync(COLUMN_MIGRATION_PATH)).toBe(true);
    });

    it('adds the column with NOT NULL DEFAULT false (idempotent)', () => {
      const sql = fs.readFileSync(COLUMN_MIGRATION_PATH, 'utf-8');
      expect(sql).toMatch(
        /ALTER TABLE\s+"app"\."Summary"\s+ADD COLUMN IF NOT EXISTS\s+"enrichmentApplied"\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+false/i
      );
    });

    it('does NOT contain CREATE INDEX (the index swap is post-deploy)', () => {
      const sql = fs.readFileSync(COLUMN_MIGRATION_PATH, 'utf-8');
      // Allow CREATE INDEX inside SQL comments, but not as a real statement.
      const stripped = sql.replace(/--[^\n]*/g, '');
      expect(stripped).not.toMatch(/CREATE\s+INDEX/i);
    });
  });

  describe('post-deploy index swap', () => {
    it('exists at the expected path', () => {
      expect(fs.existsSync(INDEX_SWAP_SQL_PATH)).toBe(true);
    });

    it('uses CREATE INDEX CONCURRENTLY (no production write block)', () => {
      const sql = fs.readFileSync(INDEX_SWAP_SQL_PATH, 'utf-8');
      const stripped = sql.replace(/--[^\n]*/g, '');
      expect(stripped).toMatch(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS/i);
      // Index name must reflect the 3-col composition.
      expect(stripped).toMatch(/Summary_filingUrl_filingType_enrichmentApplied_idx/);
      // Must drop the legacy 2-col index too.
      expect(stripped).toMatch(/DROP\s+INDEX\s+CONCURRENTLY\s+IF\s+EXISTS/i);
    });
  });
});
