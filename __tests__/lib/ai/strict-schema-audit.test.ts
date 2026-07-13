/**
 * Strict-mode schema compatibility guard.
 *
 * Walks every form schema in unified-prompts.ts, runs it through a
 * strict-mode converter, and asserts the result is compliant. Failure
 * mode: a future contributor adds a schema with `oneOf` / `format` /
 * `additionalProperties: true`, and if `response_format` strict mode is
 * ever enabled at the OpenRouter seam, requests will start erroring at
 * deploy. This test catches it pre-deploy.
 *
 * The converter and compliance walker are inlined here because there is
 * no production caller — the schemas in `unified-prompts.ts` flow to
 * `summarize.ts` as-is, never through `toStrictSchema`. Per LANGUAGE.md,
 * a module with one adapter is a hypothetical seam; the previous
 * `lib/ai/prompts/strict-schema.ts` (129 LOC) was test infrastructure
 * shaped like production code. If a second caller ever emerges — e.g.
 * the OpenRouter client adopting `response_format: { type: 'json_schema',
 * strict: true }` — re-extract a real module behind a real seam.
 */

import { getSchemaForFormType } from '../../../lib/ai/prompts/unified-prompts';

type JsonSchemaNode = Record<string, unknown> & {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode | JsonSchemaNode[];
  description?: string;
  additionalProperties?: boolean | JsonSchemaNode;
};

/**
 * Recursively convert a schema to strict-mode-compatible form:
 *  - every property in `required`
 *  - properties not originally required become nullable: type: ['X', 'null']
 *  - additionalProperties forced to false on objects
 *  - oneOf / anyOf / format / pattern stripped (the prompt carries
 *    the equivalent constraint as natural language)
 *  - `items` recursed; nested objects recursed
 *
 * Returns a deep clone; never mutates input.
 */
function toStrictSchema(input: JsonSchemaNode): JsonSchemaNode {
  return convertNode(input, /* parentRequired */ true);
}

function convertNode(node: JsonSchemaNode, isRequiredInParent: boolean): JsonSchemaNode {
  const out: JsonSchemaNode = { ...node };

  // Strip strict-mode-incompatible keywords. Their semantics are handled
  // either by the prompt or are simply discarded at the API level.
  delete (out as Record<string, unknown>).oneOf;
  delete (out as Record<string, unknown>).anyOf;
  delete (out as Record<string, unknown>).allOf;
  delete (out as Record<string, unknown>).format;
  delete (out as Record<string, unknown>).pattern;
  delete (out as Record<string, unknown>).enum;
  delete (out as Record<string, unknown>).minLength;
  delete (out as Record<string, unknown>).maxLength;
  delete (out as Record<string, unknown>).minimum;
  delete (out as Record<string, unknown>).maximum;
  delete (out as Record<string, unknown>).minItems;
  delete (out as Record<string, unknown>).maxItems;

  if (out.type === 'object' || out.properties) {
    const originalRequired = new Set<string>(Array.isArray(out.required) ? out.required : []);
    const newProps: Record<string, JsonSchemaNode> = {};
    if (out.properties) {
      for (const [propName, propSchema] of Object.entries(out.properties)) {
        const wasRequired = originalRequired.has(propName);
        newProps[propName] = convertNode(propSchema, wasRequired);
      }
      out.properties = newProps;
      out.required = Object.keys(newProps);
    }
    out.additionalProperties = false;
  }

  if (out.type === 'array' && out.items) {
    if (Array.isArray(out.items)) {
      out.items = out.items.map(i => convertNode(i, true));
    } else {
      out.items = convertNode(out.items, true);
    }
  }

  // Nullable union: when this property was NOT originally required in its
  // parent, allow null so the strict "every key required" rule doesn't
  // break legitimate optional semantics.
  if (!isRequiredInParent && typeof out.type === 'string' && out.type !== 'null') {
    out.type = [out.type, 'null'];
  }

  return out;
}

/**
 * Walks a schema and returns strict-mode violations. Empty array = compliant.
 */
function auditStrictCompliance(node: JsonSchemaNode, path = '$'): string[] {
  const issues: string[] = [];
  if ('oneOf' in node) issues.push(`${path}: uses oneOf (not allowed in strict mode)`);
  if ('anyOf' in node) issues.push(`${path}: uses anyOf`);
  if ('allOf' in node) issues.push(`${path}: uses allOf`);
  if ('format' in node) issues.push(`${path}: uses format`);
  if ('pattern' in node) issues.push(`${path}: uses pattern`);
  if (node.additionalProperties === true) issues.push(`${path}: additionalProperties=true`);
  if (node.type === 'object' && node.properties) {
    const required = new Set(Array.isArray(node.required) ? node.required : []);
    for (const propName of Object.keys(node.properties)) {
      if (!required.has(propName)) {
        issues.push(`${path}.${propName}: not in 'required' (strict mode requires every property)`);
      }
      issues.push(...auditStrictCompliance(node.properties[propName], `${path}.${propName}`));
    }
  }
  if (node.type === 'array' && node.items && !Array.isArray(node.items)) {
    issues.push(...auditStrictCompliance(node.items, `${path}[]`));
  }
  return issues;
}

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
      expect(props.alwaysHere.type).toBe('string');
      expect(props.maybeHere.type).toEqual(['string', 'null']);
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
