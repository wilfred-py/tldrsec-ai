/**
 * Tests for counterparty context enrichment in 8-K M&A filings
 */

// Mock logger and monitoring
jest.mock('../../logging', () => ({
  logger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    recordMetric: jest.fn(),
  },
}));

import { isMAFiling, searchCounterpartyContext, getCounterpartyContext } from '../counterparty-context';

// Save and restore original env vars
const originalTldrsecKey = process.env.TLDRSEC_AI_SUMMARIZER;

// Create a mock fetch function passed directly to searchCounterpartyContext
// (avoids Node.js native fetch vs global.fetch mocking issues)
const mockFetchFn = jest.fn() as jest.MockedFunction<typeof fetch>;

beforeEach(() => {
  mockFetchFn.mockClear();
  // Clear the real API key that setup-integration.js loads from .env.local
  delete process.env.TLDRSEC_AI_SUMMARIZER;
});

afterEach(() => {
  if (originalTldrsecKey) {
    process.env.TLDRSEC_AI_SUMMARIZER = originalTldrsecKey;
  }
});


describe('isMAFiling', () => {
  const maContent = `
    UNITED STATES SECURITIES AND EXCHANGE COMMISSION
    FORM 8-K CURRENT REPORT
    Item 1.01 Entry into a Material Definitive Agreement
    The Company entered into a definitive agreement for the acquisition of BMarko Structures LLC.
  `;

  it('returns true for Item 1.01 with acquisition keyword', () => {
    expect(isMAFiling(maContent, '8-K')).toBe(true);
  });

  it('returns true for Item 2.01 with merger keyword', () => {
    const content = 'Item 2.01 Completion of Acquisition. The company completed the merger with Target Corp.';
    expect(isMAFiling(content, '8-K')).toBe(true);
  });

  it('returns true for 8-K/A form type', () => {
    expect(isMAFiling(maContent, '8-K/A')).toBe(true);
  });

  it('returns false for Item 2.02 (earnings)', () => {
    const content = 'Item 2.02 Results of Operations. Revenue increased 15% year-over-year.';
    expect(isMAFiling(content, '8-K')).toBe(false);
  });

  it('returns false for non-8-K form types', () => {
    expect(isMAFiling(maContent, '10-K')).toBe(false);
    expect(isMAFiling(maContent, '4')).toBe(false);
    expect(isMAFiling(maContent, 'DEF 14A')).toBe(false);
  });

  it('returns false for Item 1.01 without M&A keywords', () => {
    const content = 'Item 1.01 Entry into a Material Definitive Agreement. The Company entered into a credit facility.';
    expect(isMAFiling(content, '8-K')).toBe(false);
  });

  it('handles case-insensitive item matching', () => {
    const content = 'ITEM 1.01 Entry into Material Definitive Agreement. Acquisition of XYZ Corp.';
    expect(isMAFiling(content, '8-K')).toBe(true);
  });

  it('detects business combination keyword', () => {
    const content = 'Item 2.01. The business combination with ABC Holdings was completed.';
    expect(isMAFiling(content, '8-K')).toBe(true);
  });

  it('detects purchase agreement keyword', () => {
    const content = 'Item 1.01. The Company entered into a purchase agreement for all outstanding shares.';
    expect(isMAFiling(content, '8-K')).toBe(true);
  });
});

describe('searchCounterpartyContext', () => {
  const filingExcerpt = 'The Company entered into a definitive agreement for the acquisition of BMarko Structures LLC.';

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-api-key';
    process.env.DEFAULT_AI_MODEL = 'x-ai/grok-4.1-fast';
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.DEFAULT_AI_MODEL;
  });

  it('returns parsed result on successful search', async () => {
    mockFetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '{"counterpartyName": "BMarko Structures LLC", "context": "BMarko Structures is a modular construction company specializing in data center modules and edge computing infrastructure."}',
          },
        }],
      }),
    });

    const result = await searchCounterpartyContext(filingExcerpt, 'Vertiv Holdings', 'VRT', mockFetchFn);

    expect(mockFetchFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      counterpartyName: 'BMarko Structures LLC',
      context: 'BMarko Structures is a modular construction company specializing in data center modules and edge computing infrastructure.',
    });
  });

  it('sends request with web search tool', async () => {
    // Verify the env var is set
    expect(process.env.OPENROUTER_API_KEY).toBe('test-api-key');

    mockFetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"counterpartyName": "X", "context": "Y"}' } }],
      }),
    });

    await searchCounterpartyContext(filingExcerpt, 'Vertiv', 'VRT', mockFetchFn);

    expect(mockFetchFn).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
      })
    );

    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    expect(body.tools).toEqual([{ type: 'openrouter:web_search' }]);
  });

  it('wraps filing excerpt in XML delimiters', async () => {
    mockFetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"counterpartyName": "X", "context": "Y"}' } }],
      }),
    });

    await searchCounterpartyContext(filingExcerpt, 'Vertiv', 'VRT', mockFetchFn);

    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    const userMessage = body.messages.find((m: { role: string }) => m.role === 'user');
    expect(userMessage.content).toContain('<filing_excerpt>');
    expect(userMessage.content).toContain('</filing_excerpt>');
  });

  it('returns null when API key is missing', async () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.TLDRSEC_AI_SUMMARIZER;

    const result = await searchCounterpartyContext(filingExcerpt, 'Vertiv', 'VRT', mockFetchFn);
    expect(result).toBeNull();
    expect(mockFetchFn).not.toHaveBeenCalled();
  });

  it('returns null when API returns error status', async () => {
    mockFetchFn.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const result = await searchCounterpartyContext(filingExcerpt, 'Vertiv', 'VRT', mockFetchFn);
    expect(result).toBeNull();
  });

  it('returns null when response content is empty', async () => {
    mockFetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '' } }],
      }),
    });

    const result = await searchCounterpartyContext(filingExcerpt, 'Vertiv', 'VRT', mockFetchFn);
    expect(result).toBeNull();
  });

  it('returns null when response content is null', async () => {
    mockFetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: null } }],
      }),
    });

    const result = await searchCounterpartyContext(filingExcerpt, 'Vertiv', 'VRT', mockFetchFn);
    expect(result).toBeNull();
  });

  it('returns null when JSON parse fails', async () => {
    mockFetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'This is not valid JSON at all.' } }],
      }),
    });

    const result = await searchCounterpartyContext(filingExcerpt, 'Vertiv', 'VRT', mockFetchFn);
    expect(result).toBeNull();
  });

  it('returns null when JSON is incomplete (missing context)', async () => {
    mockFetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"counterpartyName": "BMarko"}' } }],
      }),
    });

    const result = await searchCounterpartyContext(filingExcerpt, 'Vertiv', 'VRT', mockFetchFn);
    expect(result).toBeNull();
  });

  it('handles JSON wrapped in markdown code fences', async () => {
    mockFetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '```json\n{"counterpartyName": "BMarko Structures LLC", "context": "Modular data center builder."}\n```',
          },
        }],
      }),
    });

    const result = await searchCounterpartyContext(filingExcerpt, 'Vertiv', 'VRT', mockFetchFn);
    expect(result).toEqual({
      counterpartyName: 'BMarko Structures LLC',
      context: 'Modular data center builder.',
    });
  });

  it('returns null on fetch timeout', async () => {
    mockFetchFn.mockRejectedValueOnce(
      new DOMException('The operation was aborted', 'AbortError')
    );

    const result = await searchCounterpartyContext(filingExcerpt, 'Vertiv', 'VRT', mockFetchFn);
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    mockFetchFn.mockRejectedValueOnce(new Error('Network failure'));

    const result = await searchCounterpartyContext(filingExcerpt, 'Vertiv', 'VRT', mockFetchFn);
    expect(result).toBeNull();
  });
});

describe('getCounterpartyContext', () => {
  const maContent = `
    Item 1.01 Entry into a Material Definitive Agreement
    The Company entered into a definitive agreement for the acquisition of BMarko Structures LLC.
  `;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-api-key';
    process.env.DEFAULT_AI_MODEL = 'x-ai/grok-4.1-fast';
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.DEFAULT_AI_MODEL;
  });

  it('returns context string for M&A filing', async () => {
    mockFetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '{"counterpartyName": "BMarko Structures LLC", "context": "Modular data center construction company."}',
          },
        }],
      }),
    });

    const result = await getCounterpartyContext(maContent, '8-K', 'Vertiv Holdings', 'VRT', mockFetchFn);
    expect(result).toBe('BMarko Structures LLC: Modular data center construction company.');
  });

  it('returns null for non-M&A filing without making API call', async () => {
    const earningsContent = 'Item 2.02 Results of Operations. Revenue was $5B.';
    const result = await getCounterpartyContext(earningsContent, '8-K', 'Apple Inc', 'AAPL', mockFetchFn);

    expect(result).toBeNull();
    expect(mockFetchFn).not.toHaveBeenCalled();
  });

  it('returns null for non-8-K filing without making API call', async () => {
    const result = await getCounterpartyContext(maContent, '10-K', 'Vertiv Holdings', 'VRT', mockFetchFn);

    expect(result).toBeNull();
    expect(mockFetchFn).not.toHaveBeenCalled();
  });

  it('returns null without throwing when API fails', async () => {
    mockFetchFn.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Server Error',
    });

    const result = await getCounterpartyContext(maContent, '8-K', 'Vertiv', 'VRT', mockFetchFn);
    expect(result).toBeNull();
  });
});
