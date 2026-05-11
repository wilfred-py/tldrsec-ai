/**
 * Audit test: every numeric-looking schema field has anti-hallucination
 * grounding language in its description (PR 3 of the plan).
 *
 * Detection is INVERTED from a hint-list approach: walk every `type ===
 * 'string'` field and flag any whose description contains `$`, `%`,
 * `\bshares?\b`, or `\bdollars?\b` but lacks `REQUIRED_GROUNDING_PHRASES`.
 * Catches `coupon`, `yield`, `spread`, `eps`, `revenue`, `margin`,
 * `dividend`, `maturity`, `proceeds`, `nav` that a hint list misses.
 *
 * Doubles as the implementing agent's audit checklist — running it tells
 * them which fields they still need to sweep.
 */

import { FORM_SCHEMAS, generateFilingPrompt } from '@/lib/ai/prompts/unified-prompts';

const NUMERIC_DESC_PATTERNS = [
  /\$/,
  /%/,
  /\bshares?\b/i,
  /\bdollars?\b/i,
];

const REQUIRED_GROUNDING_PHRASES = [
  'leave null',
  'do not estimate',
  'do not infer',
  'do not extrapolate',
  'explicitly states',
  'as stated',
  'directly disclosed',
];

interface FieldNode {
  type?: string;
  description?: string;
  properties?: Record<string, unknown>;
  items?: unknown;
  required?: string[];
}

/**
 * Strip example clauses before pattern-checking. Many prose/categorical
 * field descriptions contain `$` or `%` only inside `(e.g., "...")` or
 * `Example: "..."` snippets — those are illustrations, not requests for a
 * numeric value as the field's content. Without this strip we false-flag
 * `headline`, `emailSubject`, `importanceScore`, etc.
 */
function stripExamples(desc: string): string {
  return desc
    .replace(/\(e\.g\.,?\s*[^)]*\)/gi, '')
    .replace(/example:\s*"[^"]*"/gi, '')
    .replace(/"[^"]*"/g, ''); // any other quoted illustrative text
}

/** Names of prose / categorical fields that legitimately mention $ or %. */
const PROSE_FIELD_ALLOWLIST = new Set([
  'summary',
  'whyItMatters',
  'headline',
  'emailSubject',
  'description',
  'governanceContext',
  'importanceScore',
  'narrative',
  'commentary',
  // Categorical role fields ("10% Owner") - not numeric values.
  'filerRole',
  'signalStrength',
  'sentiment',
]);

function looksNumeric(desc: string | undefined, fieldName: string): boolean {
  if (!desc) return false;
  if (PROSE_FIELD_ALLOWLIST.has(fieldName)) return false;
  const stripped = stripExamples(desc);
  return NUMERIC_DESC_PATTERNS.some((p) => p.test(stripped));
}

function hasGroundingLanguage(desc: string | undefined): boolean {
  if (!desc) return false;
  const lower = desc.toLowerCase();
  return REQUIRED_GROUNDING_PHRASES.some((p) => lower.includes(p));
}

function walkSchema(node: unknown, path: string, missing: string[]): void {
  if (!node || typeof node !== 'object') return;
  const n = node as FieldNode;

  if (n.type === 'object' && n.properties) {
    for (const [propName, propRaw] of Object.entries(n.properties)) {
      const prop = propRaw as FieldNode;
      const childPath = `${path}.${propName}`;
      if (prop.type === 'string' && looksNumeric(prop.description, propName) && !hasGroundingLanguage(prop.description)) {
        missing.push(childPath);
      }
      walkSchema(prop, childPath, missing);
    }
  }
  if (n.type === 'array' && n.items) {
    walkSchema(n.items, `${path}[]`, missing);
  }
}

describe('schema fields with numeric description hints have anti-hallucination language', () => {
  for (const [formType, schema] of Object.entries(FORM_SCHEMAS)) {
    it(`${formType} grounding sweep`, () => {
      const missing: string[] = [];
      walkSchema(schema, formType, missing);
      if (missing.length > 0) {
        throw new Error(
          `Numeric-looking string fields missing anti-hallucination language ` +
          `(add via withGroundingNote or hand-edit description):\n  ${missing.join('\n  ')}`
        );
      }
    });
  }
});

describe('universal grounding block is prepended to every form\'s system prompt', () => {
  it.each(['10-K', '10-Q', '8-K', '4', '144', 'S-3', 'S-1', '11-K', 'DEFA14A', 'FWP', '424B2', '3'])(
    '%s systemPrompt contains GROUNDING RULES header',
    (formType) => {
      const result = generateFilingPrompt({ formType });
      expect(result.systemPrompt).toContain('=== GROUNDING RULES (apply to every field) ===');
    }
  );

  it('S-3 systemPrompt additionally contains the shelf-bucket addendum', () => {
    const result = generateFilingPrompt({ formType: 'S-3' });
    expect(result.systemPrompt).toContain('=== S-3 SHELF-SPECIFIC RULE ===');
    expect(result.systemPrompt).toContain('NO PER-BUCKET ALLOCATIONS');
  });

  it('non-S-3 forms do NOT contain the shelf-bucket addendum', () => {
    const result = generateFilingPrompt({ formType: '10-K' });
    expect(result.systemPrompt).not.toContain('=== S-3 SHELF-SPECIFIC RULE ===');
  });

  it('GROUNDING_PROMPT_ENABLED=0 disables the universal block (kill switch)', () => {
    const original = process.env.GROUNDING_PROMPT_ENABLED;
    process.env.GROUNDING_PROMPT_ENABLED = '0';
    try {
      const result = generateFilingPrompt({ formType: 'S-3' });
      expect(result.systemPrompt).not.toContain('=== GROUNDING RULES');
      expect(result.systemPrompt).not.toContain('=== S-3 SHELF-SPECIFIC RULE ===');
      // Base prompt is still present.
      expect(result.systemPrompt).toContain('CRITICAL: You must respond with ONLY valid JSON');
    } finally {
      if (original === undefined) delete process.env.GROUNDING_PROMPT_ENABLED;
      else process.env.GROUNDING_PROMPT_ENABLED = original;
    }
  });
});

describe('formatSchemaDescription does not mangle grounding text containing dashes', () => {
  it('userPrompt for S-3 parses cleanly with grounding language present', () => {
    const result = generateFilingPrompt({ formType: 'S-3' });
    // Sanity: the userPrompt embeds field descriptions. If our grounding
    // language collided with the ` - ` separator, lines would have unbalanced
    // structure. Spot-check that every schema line still has a field name
    // followed by a quoted type and a description.
    const lines = result.userPrompt.split('\n');
    const fieldLines = lines.filter((l) => /^\s*"[A-Za-z]+":\s/.test(l));
    expect(fieldLines.length).toBeGreaterThan(0);
    for (const line of fieldLines) {
      // Each field line should still resolve to "name": "type"... - description.
      expect(line).toMatch(/^\s*"[A-Za-z]+":\s*("[^"]+"|\[\.\.\.\]|\{\.\.\.\})/);
    }
  });
});
