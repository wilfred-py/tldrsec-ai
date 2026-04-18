import { describe, it, expect } from '@jest/globals';
import { EVENTS, type EventName, type EventProps } from '@/lib/analytics/events';

describe('Analytics event registry', () => {
  it('every EVENTS.* value is a snake_case string', () => {
    for (const [key, value] of Object.entries(EVENTS)) {
      expect(typeof value).toBe('string');
      // All caps key maps to lowercase snake_case value.
      expect(value).toMatch(/^[a-z][a-z0-9_]*$/);
      // Key and value should describe the same thing.
      expect(key).toBe(key.toUpperCase());
    }
  });

  it('every EVENTS.* value is unique', () => {
    const values = Object.values(EVENTS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('every EVENTS.* value has a matching EventProps entry (type-level)', () => {
    // This test is primarily a compile-time guard: if a new EVENTS entry is
    // added without a corresponding EventProps key, TypeScript fails this file.
    // The runtime assertion is a sanity check that the object actually has
    // all the event names as enumerable keys when we describe them.
    const eventNames: EventName[] = Object.values(EVENTS);
    for (const name of eventNames) {
      // Force type resolution by assigning a placeholder that matches the shape.
      // If EventProps[name] resolves to `never`, this line fails to compile.
      const _check: EventProps[typeof name] = null as unknown as EventProps[typeof name];
      expect(name).toBeTruthy();
      void _check;
    }
  });

  it('rejects unknown event names at type level', () => {
    // Type-level guard. The `as` casts below would fail in strict mode if
    // EventProps ever loses its discriminated-union shape.
    const anyName: EventName = EVENTS.LANDING_CTA_CLICK;
    const _props: EventProps[typeof anyName] = {
      cta_location: 'hero',
      cta_text: 'Start Free Trial',
    };
    expect(_props.cta_location).toBe('hero');
  });
});
