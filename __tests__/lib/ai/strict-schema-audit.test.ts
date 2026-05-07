/**
 * Strict-mode schema compatibility guard.
 *
 * Walks every form schema in unified-prompts.ts, runs it through
 * `toStrictSchema`, and asserts `auditStrictCompliance` returns zero
 * violations. Failure mode: a future contributor adds a schema with
 * `oneOf` / `format` / `additionalProperties: true` and `response_format`
 * starts erroring at request time. This test catches it before deploy.
 */

import { toStrictSchema, auditStrictCompliance } from '../../../lib/ai/prompts/strict-schema';
import { getSchemaForFormType } from '../../../lib/ai/prompts/unified-prompts';

const ALL_FORM_TYPES = [
  '10-K',
  '10-Q',
  '8-K',
  '4',
  '144',
  '3',
  '424B2',
  'S-1',
  'S-3',
  '11-K',
  'DEFA14A',
  'FWP',
];

describe('strict-mode schema audit', () => {
  describe.each(ALL_FORM_TYPES)('formType=%s', (formType) => {
    const looseSchema = getSchemaForFormType(formType) as unknown as Record<string, unknown>;
    const strictSchema = toStrictSchema(looseSchema);

    it('converts to a strict-mode-compliant schema (zero violations)', () => {
      const violations = auditStrictCompliance(strictSchema);
      if (violations.length > 0) {
        throw new Error(`Schema for ${formType} has ${violations.length} strict-mode violations:\n  ${violations.join('\n  ')}`);
      }
    });

    it('preserves the top-level type', () => {
      expect(strictSchema.type).toBe(looseSchema.type);
    });

    it('marks every property as required', () => {
      const props = (strictSchema.properties as Record<string, unknown>) || {};
      const required = (strictSchema.required as string[]) || [];
      const propNames = Object.keys(props);
      const missing = propNames.filter(name => !required.includes(name));
      expect(missing).toEqual([]);
    });

    it('forces additionalProperties=false on the root object', () => {
      if (strictSchema.type === 'object') {
        expect(strictSchema.additionalProperties).toBe(false);
      }
    });
  });

  describe('toStrictSchema converter', () => {
    it('makes originally-optional fields nullable', () => {
      const loose = {
        type: 'object',
        properties: {
          alwaysHere: { type: 'string' },
          maybeHere: { type: 'string' },
        },
        required: ['alwaysHere'],
      };
      const strict = toStrictSchema(loose);
      const props = strict.properties as Record<string, { type: string | string[] }>;
      expect(props.alwaysHere.type).toBe('string'); // was required, stays singular
      expect(props.maybeHere.type).toEqual(['string', 'null']); // was optional, now nullable
      expect(strict.required).toEqual(['alwaysHere', 'maybeHere']);
    });

    it('strips disallowed keywords (oneOf, format, pattern)', () => {
      const loose = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email', pattern: '.+@.+' },
          variant: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        },
        required: ['email', 'variant'],
      };
      const strict = toStrictSchema(loose);
      const props = strict.properties as Record<string, Record<string, unknown>>;
      expect(props.email.format).toBeUndefined();
      expect(props.email.pattern).toBeUndefined();
      expect(props.variant.oneOf).toBeUndefined();
    });

    it('recurses into array items', () => {
      const loose = {
        type: 'object',
        properties: {
          rows: {
            type: 'array',
            items: {
              type: 'object',
              properties: { a: { type: 'string' }, b: { type: 'string' } },
              required: ['a'],
            },
          },
        },
        required: ['rows'],
      };
      const strict = toStrictSchema(loose);
      const violations = auditStrictCompliance(strict);
      expect(violations).toEqual([]);
    });

    it('does not mutate the input', () => {
      const loose = {
        type: 'object',
        properties: { x: { type: 'string', format: 'email' } },
        required: [] as string[],
      };
      const before = JSON.stringify(loose);
      toStrictSchema(loose);
      expect(JSON.stringify(loose)).toBe(before);
    });
  });
});
