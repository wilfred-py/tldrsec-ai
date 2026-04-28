/**
 * Pre-merge gate G4 — regression snapshot for the existing five enrichment
 * providers (counterparty, governance, debt_issuance, earnings,
 * capital_return). Pins their public surface so adding the xSentiment 6th
 * provider (or any future addition) cannot silently drift the existing
 * `whyItMatters` output.
 *
 * Snapshots cover, per provider:
 *   - metadata (name, sectionHeader, maxExcerptLength)
 *   - detect() across a (formType, content) matrix of positives + negatives
 *   - buildPrompt() output for fixed (excerpt, companyName, ticker)
 *   - parseResponse() over valid + truncation-edge JSON inputs
 *
 * Plus an inline snapshot pinning the first five entries in
 * `DEFAULT_PROVIDERS` so the execution order can't be reshuffled.
 *
 * If you intentionally change one of these surfaces, run:
 *   npx jest --updateSnapshot __tests__/ai/web-search-context-providers.snapshot.test.ts
 * and explain the drift in the PR description.
 */

import {
  counterpartyProvider,
  governanceProvider,
  debtIssuanceProvider,
  earningsProvider,
  capitalReturnProvider,
  DEFAULT_PROVIDERS,
} from '../../lib/ai/web-search-context';

const PROVIDERS = [
  counterpartyProvider,
  governanceProvider,
  debtIssuanceProvider,
  earningsProvider,
  capitalReturnProvider,
] as const;

interface DetectFixture {
  label: string;
  formType: string;
  content: string;
}

const DETECT_FIXTURES: DetectFixture[] = [
  // counterparty positives
  {
    label: 'counterparty: 8-K Item 1.01 acquisition',
    formType: '8-K',
    content:
      'Item 1.01 Entry into a Material Definitive Agreement. ' +
      'The Company entered into a purchase agreement to acquire Target Corp.',
  },
  {
    label: 'counterparty: 8-K/A Item 2.01 merger',
    formType: '8-K/A',
    content:
      'Item 2.01 Completion of Acquisition. ' +
      'The Company completed the business combination with Target Inc.',
  },
  // governance positives
  {
    label: 'governance: 8-K Item 5.02 director resignation',
    formType: '8-K',
    content:
      'Item 5.02 Departure of Directors or Certain Officers. ' +
      'Jane Doe resigned from the Board of Directors.',
  },
  {
    label: 'governance: 8-K Item 5.07 director re-election',
    formType: '8-K',
    content:
      'Item 5.07 Submission of Matters to a Vote of Security Holders. ' +
      'The directors stood for re-election.',
  },
  // debt positives
  {
    label: 'debt: 424B2 senior notes',
    formType: '424B2',
    content:
      '$500M senior notes due 2034. Pricing supplement. Coupon 5.25%. Indenture dated 2024.',
  },
  {
    label: 'debt: FWP subordinated notes',
    formType: 'FWP',
    content:
      'Free writing prospectus for subordinated notes due 2031. Pricing supplement attached.',
  },
  // earnings positive
  {
    label: 'earnings: 8-K Item 2.02 results',
    formType: '8-K',
    content:
      'Item 2.02 Results of Operations and Financial Condition. ' +
      'Q3 revenue increased and EPS exceeded guidance for the fiscal quarter.',
  },
  // capital return positives
  {
    label: 'capital_return: 8-K Item 8.01 buyback',
    formType: '8-K',
    content:
      'Item 8.01 Other Events. The Board authorized a $2B share repurchase program.',
  },
  {
    label: 'capital_return: 8-K Item 8.01 dividend',
    formType: '8-K',
    content:
      'Item 8.01 Other Events. Authorization of a special dividend.',
  },
  // negatives
  {
    label: 'no match: 10-K with M&A keywords',
    formType: '10-K',
    content: 'Item 1.01 acquisition agreement',
  },
  {
    label: 'no match: empty form type',
    formType: '',
    content: 'Item 1.01 acquisition agreement',
  },
  {
    label: 'no match: 8-K Item 9.01 (financial statements only)',
    formType: '8-K',
    content: 'Item 9.01 Financial Statements and Exhibits.',
  },
  {
    label: 'no match: 8-K Item 1.01 without M&A keywords',
    formType: '8-K',
    content: 'Item 1.01 Entry into a Material Definitive Agreement (lease renewal).',
  },
];

const PROMPT_INPUT = {
  excerpt:
    'Acme Corp ("Acquiror") entered into an Agreement and Plan of Merger with ' +
    'Widget Holdings Inc. ("Target"), pursuant to which Acquiror will acquire ' +
    'all outstanding shares of Target for $500 million in cash.',
  companyName: 'Acme Corp',
  ticker: 'ACME',
};

interface ParseFixture {
  label: string;
  raw: string;
}

const PARSE_FIXTURES: ParseFixture[] = [
  {
    label: 'valid response',
    raw: JSON.stringify({ label: 'Target Corp', context: 'A 50-year-old widget maker.' }),
  },
  {
    label: 'label exceeding 200 chars (truncated)',
    raw: JSON.stringify({ label: 'X'.repeat(300), context: 'ok' }),
  },
  {
    label: 'context exceeding 500 chars (truncated)',
    raw: JSON.stringify({ label: 'ok', context: 'Y'.repeat(700) }),
  },
  {
    label: 'missing label field returns null',
    raw: JSON.stringify({ context: 'no label' }),
  },
  {
    label: 'missing context field returns null',
    raw: JSON.stringify({ label: 'no context' }),
  },
  {
    label: 'top-level array returns null',
    raw: JSON.stringify(['not', 'an', 'object']),
  },
  {
    label: 'null payload returns null',
    raw: 'null',
  },
];

describe('web-search-context provider regression snapshot (G4)', () => {
  it.each(PROVIDERS.map(p => [p.name, p] as const))(
    'metadata for %s',
    (_name, provider) => {
      expect({
        name: provider.name,
        sectionHeader: provider.sectionHeader,
        maxExcerptLength: provider.maxExcerptLength,
      }).toMatchSnapshot();
    },
  );

  it.each(PROVIDERS.map(p => [p.name, p] as const))(
    'detect() matrix for %s',
    (_name, provider) => {
      const matrix = DETECT_FIXTURES.map(fx => ({
        fixture: fx.label,
        formType: fx.formType,
        result: provider.detect(fx.content, fx.formType),
      }));
      expect(matrix).toMatchSnapshot();
    },
  );

  it.each(PROVIDERS.map(p => [p.name, p] as const))(
    'buildPrompt() output for %s',
    (_name, provider) => {
      expect(
        provider.buildPrompt(
          PROMPT_INPUT.excerpt,
          PROMPT_INPUT.companyName,
          PROMPT_INPUT.ticker,
        ),
      ).toMatchSnapshot();
    },
  );

  it.each(PROVIDERS.map(p => [p.name, p] as const))(
    'parseResponse() across edge inputs for %s',
    (_name, provider) => {
      const outcomes = PARSE_FIXTURES.map(fx => {
        try {
          return { fixture: fx.label, result: provider.parseResponse(fx.raw) };
        } catch (err) {
          return {
            fixture: fx.label,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });
      expect(outcomes).toMatchSnapshot();
    },
  );
});

describe('DEFAULT_PROVIDERS execution order (G4)', () => {
  it('first five providers stay in pinned order even after additions', () => {
    const firstFive = DEFAULT_PROVIDERS.slice(0, 5).map(p => p.name);
    expect(firstFive).toMatchInlineSnapshot(`
[
  "counterparty",
  "governance",
  "debt_issuance",
  "earnings",
  "capital_return",
]
`);
  });
});
