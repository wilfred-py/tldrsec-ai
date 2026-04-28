import {
  checkXSentimentEligibility,
  normalizeTicker,
  _resetAllowlistCache,
} from '../x-sentiment-eligibility';

describe('normalizeTicker', () => {
  it('strips leading $ and uppercases', () => {
    expect(normalizeTicker('$aapl')).toBe('AAPL');
    expect(normalizeTicker('  msft ')).toBe('MSFT');
    expect(normalizeTicker('$$brk.b')).toBe('BRK.B');
  });

  it('returns empty string for null/undefined/empty', () => {
    expect(normalizeTicker(null)).toBe('');
    expect(normalizeTicker(undefined)).toBe('');
    expect(normalizeTicker('')).toBe('');
  });
});

describe('checkXSentimentEligibility', () => {
  beforeEach(() => {
    delete process.env.X_SENTIMENT_ALLOWLIST_EXTRA;
    _resetAllowlistCache();
  });

  it('approves a high-importance form on an allowlisted ticker', () => {
    const result = checkXSentimentEligibility({ ticker: '$AAPL', formType: '8-K' });
    expect(result.eligible).toBe(true);
    expect(result.ticker).toBe('AAPL');
    expect(result.reason).toBeUndefined();
  });

  it('approves with case-insensitive form match', () => {
    const result = checkXSentimentEligibility({ ticker: 'TSLA', formType: '10-k' });
    expect(result.eligible).toBe(true);
  });

  it('rejects when ticker missing', () => {
    expect(checkXSentimentEligibility({ ticker: '', formType: '10-K' })).toMatchObject({
      eligible: false,
      reason: 'no_ticker',
    });
    expect(checkXSentimentEligibility({ ticker: null, formType: '10-K' })).toMatchObject({
      eligible: false,
      reason: 'no_ticker',
    });
  });

  it('rejects malformed tickers', () => {
    expect(checkXSentimentEligibility({ ticker: 'TOOLONGSYMBOL', formType: '10-K' })).toMatchObject({
      eligible: false,
      reason: 'invalid_ticker_format',
    });
    expect(checkXSentimentEligibility({ ticker: '$1234', formType: '10-K' })).toMatchObject({
      eligible: false,
      reason: 'invalid_ticker_format',
    });
    expect(checkXSentimentEligibility({ ticker: '$AAPL!', formType: '10-K' })).toMatchObject({
      eligible: false,
      reason: 'invalid_ticker_format',
    });
  });

  it('rejects unknown form types', () => {
    expect(checkXSentimentEligibility({ ticker: '$AAPL', formType: 'NOT-A-FORM' })).toMatchObject({
      eligible: false,
      reason: 'unknown_form_type',
    });
  });

  it('rejects low/medium-importance forms', () => {
    expect(checkXSentimentEligibility({ ticker: '$AAPL', formType: 'NT 10-K' }).eligible).toBe(false);
  });

  it('rejects high-importance form on a ticker not in allowlist (collision protection)', () => {
    const result = checkXSentimentEligibility({ ticker: '$APPL', formType: '8-K' });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('not_in_allowlist');
  });

  it('rejects low-float / micro-cap tickers (pump-and-dump protection)', () => {
    const result = checkXSentimentEligibility({ ticker: '$XYZQ', formType: '8-K' });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('not_in_allowlist');
  });

  it('honors X_SENTIMENT_ALLOWLIST_EXTRA env override', () => {
    process.env.X_SENTIMENT_ALLOWLIST_EXTRA = 'ASML,SAP, NVDA ';
    _resetAllowlistCache();
    expect(checkXSentimentEligibility({ ticker: '$ASML', formType: '8-K' }).eligible).toBe(true);
    expect(checkXSentimentEligibility({ ticker: 'sap', formType: '10-K' }).eligible).toBe(true);
  });

  it('extra env vars do not weaken format validation', () => {
    process.env.X_SENTIMENT_ALLOWLIST_EXTRA = 'BAD-TICKER!';
    _resetAllowlistCache();
    expect(checkXSentimentEligibility({ ticker: 'BAD-TICKER!', formType: '8-K' })).toMatchObject({
      eligible: false,
      reason: 'invalid_ticker_format',
    });
  });

  describe('high-importance form coverage', () => {
    it.each([
      ['$AAPL', '10-K'],
      ['$AAPL', '10-Q'],
      ['$AAPL', '8-K'],
      ['$AAPL', '20-F'],
    ])('%s on %s is eligible', (ticker, form) => {
      expect(checkXSentimentEligibility({ ticker, formType: form }).eligible).toBe(true);
    });
  });
});
