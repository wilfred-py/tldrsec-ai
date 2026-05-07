/**
 * Strict-mode JSON Schema converter for OpenRouter `response_format`.
 *
 * Background: OpenAI-compatible structured-output mode requires schemas to
 * follow a "strict" subset: every property must appear in `required`,
 * optional fields use a nullable type union, no `oneOf`/`anyOf`/`format`/
 * regex constraints, no `additionalProperties: true`. Our source schemas
 * in `unified-prompts.ts` are written for readability + prompt clarity and
 * use the natural "optional means absent" idiom.
 *
 * Per the Phase F plan (Issue 6 / option A): single source of truth for the
 * schemas, consumers handle null. This converter applies the strict-mode
 * transformation mechanically at the API boundary so the source schemas
 * stay clean AND the wire-level contract is automatically enforced when
 * new fields are added (no manual "remember to mark required+nullable"
 * step).
 *
 * Trade-off vs. in-place rewrite of every schema: identical API behavior,
 * but the source files are not littered with `type: ['string', 'null']`
 * unions that exist only to satisfy strict mode. Template consumers already
 * use `if (field)` checks that work for both `undefined` and `null`, so no
 * downstream changes are required.
 */

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
 *  - oneOf / anyOf / format / pattern stripped (logged in dev via the
 *    paired schema-strict-compat test, not at runtime)
 *  - `items` recursed; nested objects recursed
 *
 * Returns a deep clone; never mutates input.
 */
export function toStrictSchema(input: JsonSchemaNode): JsonSchemaNode {
  return convertNode(input, /* parentRequired */ true);
}

function convertNode(node: JsonSchemaNode, isRequiredInParent: boolean): JsonSchemaNode {
  // Primitives + arrays: leaf transforms
  const out: JsonSchemaNode = { ...node };

  // Strip strict-mode-incompatible keywords. Their semantics are handled
  // either by the prompt or are simply discarded at the API level.
  delete (out as Record<string, unknown>).oneOf;
  delete (out as Record<string, unknown>).anyOf;
  delete (out as Record<string, unknown>).allOf;
  delete (out as Record<string, unknown>).format;
  delete (out as Record<string, unknown>).pattern;
  delete (out as Record<string, unknown>).enum; // strict mode handles enums via schema, not validation
  delete (out as Record<string, unknown>).minLength;
  delete (out as Record<string, unknown>).maxLength;
  delete (out as Record<string, unknown>).minimum;
  delete (out as Record<string, unknown>).maximum;
  delete (out as Record<string, unknown>).minItems;
  delete (out as Record<string, unknown>).maxItems;

  // Object: walk properties, add every key to required, recurse.
  if (out.type === 'object' || out.properties) {
    const originalRequired = new Set<string>(Array.isArray(out.required) ? out.required : []);
    const newProps: Record<string, JsonSchemaNode> = {};
    if (out.properties) {
      for (const [propName, propSchema] of Object.entries(out.properties)) {
        const wasRequired = originalRequired.has(propName);
        newProps[propName] = convertNode(propSchema, wasRequired);
      }
      out.properties = newProps;
      out.required = Object.keys(newProps); // every property required in strict mode
    }
    out.additionalProperties = false;
  }

  // Array: recurse into items
  if (out.type === 'array' && out.items) {
    if (Array.isArray(out.items)) {
      out.items = out.items.map(i => convertNode(i, true));
    } else {
      out.items = convertNode(out.items, true);
    }
  }

  // Nullable union: when this property was NOT originally required in its
  // parent, allow null so the strict "every key required" rule doesn't break
  // legitimate optional semantics. Skip when type is already a union, an
  // array of types including null, or absent (e.g. mixed-shape union we
  // already stripped).
  if (!isRequiredInParent && typeof out.type === 'string' && out.type !== 'null') {
    out.type = [out.type, 'null'];
  }

  return out;
}

/**
 * Audit helper exposed for tests: walks a schema and returns a list of
 * strict-mode violations. Empty array = compliant.
 */
export function auditStrictCompliance(node: JsonSchemaNode, path = '$'): string[] {
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
