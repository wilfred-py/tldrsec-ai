/**
 * Welcome email template — covers the new "promise" framing, ticker
 * pluralization, "Switch to daily digest" CTA, and HTML escaping (XSS).
 */
import { welcomeTemplate } from '@/lib/email/templates';

const baseData = {
  recipientName: 'Jane',
  recipientEmail: 'jane@example.com',
  unsubscribeUrl: 'https://tldrsec.app/unsubscribe?u=jane',
  preferencesUrl: 'https://tldrsec.app/preferences?u=jane',
};

describe('welcomeTemplate', () => {
  it('renders the singular promise for exactly one ticker', () => {
    const { html, text } = welcomeTemplate({
      ...baseData,
      selectedTickers: ['AAPL'],
    });
    const expected = "We'll email you when new filings are posted for 1 company.";
    expect(html).toContain(expected);
    expect(text).toContain(expected);
  });

  it('renders the plural promise when multiple tickers are selected', () => {
    const { html, text } = welcomeTemplate({
      ...baseData,
      selectedTickers: ['AAPL', 'MSFT'],
    });
    const expected = "We'll email you when new filings are posted for 2 companies.";
    expect(html).toContain(expected);
    expect(text).toContain(expected);
  });

  it('falls back to a generic promise when no tickers are passed', () => {
    const { html, text } = welcomeTemplate(baseData);
    const expected = "We'll email you when new filings are posted for the companies you track.";
    expect(html).toContain(expected);
    expect(text).toContain(expected);
  });

  it('renders the "Switch to daily digest" CTA pointing at preferencesUrl', () => {
    const { html, text } = welcomeTemplate({
      ...baseData,
      selectedTickers: ['AAPL'],
    });
    expect(html).toContain('Switch to daily digest');
    expect(html).toContain(baseData.preferencesUrl);
    expect(text).toContain('Switch to daily digest');
    expect(text).toContain(baseData.preferencesUrl);
  });

  it('escapes HTML in recipientName to prevent XSS', () => {
    const { html } = welcomeTemplate({
      ...baseData,
      recipientName: '<script>alert(1)</script>',
      selectedTickers: ['AAPL'],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes HTML in ticker symbols to prevent injection via stored ticker data', () => {
    const { html } = welcomeTemplate({
      ...baseData,
      selectedTickers: ['<img src=x onerror=alert(1)>'],
    });
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('omits the "Companies you\'re tracking" block when zero tickers', () => {
    const { html, text } = welcomeTemplate({
      ...baseData,
      selectedTickers: [],
    });
    expect(html).not.toContain("Companies you're tracking");
    expect(text).not.toContain("COMPANIES YOU'RE TRACKING");
  });
});
