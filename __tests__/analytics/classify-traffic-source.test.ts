import { describe, it, expect } from '@jest/globals';
import { classifyTrafficSource } from '@/lib/analytics/classify-traffic-source';

describe('classifyTrafficSource', () => {
  const currentUrl = 'https://tldrsec.app/companies/NVDA';

  const cases: Array<{
    name: string;
    referrer: string;
    currentUrl?: string;
    utmMedium?: string | null;
    utmSource?: string | null;
    expected: ReturnType<typeof classifyTrafficSource>;
  }> = [
    // Search engines -> organic
    { name: 'Google search', referrer: 'https://www.google.com/search?q=nvidia+10-k', expected: 'organic' },
    { name: 'Google UK', referrer: 'https://www.google.co.uk/', expected: 'organic' },
    { name: 'Bing search', referrer: 'https://www.bing.com/search?q=foo', expected: 'organic' },
    { name: 'DuckDuckGo', referrer: 'https://duckduckgo.com/?q=foo', expected: 'organic' },
    { name: 'Brave search', referrer: 'https://search.brave.com/search?q=foo', expected: 'organic' },
    { name: 'Google AMP Cache', referrer: 'https://cdn.ampproject.org/c/s/example.com', expected: 'organic' },
    { name: 'Android Google app', referrer: 'android-app://com.google.android.googlequicksearchbox/', expected: 'organic' },

    // Social -> social
    { name: 'Twitter t.co shortener', referrer: 'https://t.co/abc123', expected: 'social' },
    { name: 'X.com', referrer: 'https://x.com/someuser/status/123', expected: 'social' },
    { name: 'twitter.com', referrer: 'https://twitter.com/someuser', expected: 'social' },
    { name: 'LinkedIn', referrer: 'https://www.linkedin.com/feed/', expected: 'social' },
    { name: 'Reddit', referrer: 'https://www.reddit.com/r/stocks/comments/abc', expected: 'social' },
    { name: 'Hacker News', referrer: 'https://news.ycombinator.com/item?id=1', expected: 'social' },
    { name: 'Bluesky', referrer: 'https://bsky.app/profile/someone', expected: 'social' },
    { name: 'Android Twitter app', referrer: 'android-app://com.twitter.android/', expected: 'social' },

    // Direct
    { name: 'empty referrer', referrer: '', expected: 'direct' },
    { name: 'whitespace referrer', referrer: '   ', expected: 'direct' },
    { name: 'unknown hostname', referrer: 'https://random-unknown-blog.example.com/', expected: 'direct' },
    { name: 'malformed URL', referrer: 'not-a-url', expected: 'direct' },
    { name: 'android-app unknown package', referrer: 'android-app://com.random.unknown/', expected: 'direct' },

    // Internal (same origin)
    { name: 'same origin', referrer: 'https://tldrsec.app/', expected: 'internal' },
    { name: 'same origin subpath', referrer: 'https://tldrsec.app/sign-up', expected: 'internal' },

    // Email UTM takes precedence
    { name: 'utm_medium=email overrides empty referrer', referrer: '', utmMedium: 'email', expected: 'email' },
    { name: 'utm_medium=email overrides organic', referrer: 'https://google.com', utmMedium: 'email', expected: 'email' },
    { name: 'utm_source contains newsletter', referrer: '', utmSource: 'weekly_newsletter', expected: 'email' },
    { name: 'utm_source contains email', referrer: '', utmSource: 'transactional_email', expected: 'email' },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result = classifyTrafficSource(
        c.referrer,
        c.currentUrl ?? currentUrl,
        c.utmMedium ?? null,
        c.utmSource ?? null,
      );
      expect(result).toBe(c.expected);
    });
  }

  it('handles invalid currentUrl gracefully', () => {
    // Should not throw, should fall through the internal check.
    const result = classifyTrafficSource('https://www.google.com/', 'not a url');
    expect(result).toBe('organic');
  });
});
