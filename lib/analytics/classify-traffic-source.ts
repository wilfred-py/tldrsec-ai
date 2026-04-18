import type { TrafficSource } from './events';

const SEARCH_DOMAINS = [
  'google.com',
  'google.co.uk',
  'google.ca',
  'google.com.au',
  'google.de',
  'google.fr',
  'google.co.in',
  'google.co.jp',
  'bing.com',
  'duckduckgo.com',
  'search.brave.com',
  'kagi.com',
  'yahoo.com',
  'yandex.com',
  'baidu.com',
  'ecosia.org',
  'ask.com',
  'startpage.com',
];

const SOCIAL_DOMAINS = [
  't.co',
  'x.com',
  'twitter.com',
  'linkedin.com',
  'lnkd.in',
  'reddit.com',
  'old.reddit.com',
  'news.ycombinator.com',
  'facebook.com',
  'l.facebook.com',
  'fb.com',
  'instagram.com',
  'threads.net',
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'bsky.app',
  'mastodon.social',
  'substack.com',
  'medium.com',
  'discord.com',
  'slack.com',
  'pinterest.com',
];

function hostnameMatches(hostname: string, candidates: string[]): boolean {
  const h = hostname.toLowerCase();
  return candidates.some((d) => h === d || h.endsWith(`.${d}`));
}

/**
 * Classify a visit's traffic source from the referrer and current URL.
 *
 * Rules:
 * - Empty referrer = direct
 * - Same-origin referrer = internal (user navigating within the site)
 * - Known search engine hostname = organic
 * - Known social hostname = social
 * - UTM medium=email OR utm_source includes email/newsletter = email
 * - Google AMP cache and app schemes normalized before match
 * - Unknown hostname falls through to direct (conservative — avoids false "organic")
 */
export function classifyTrafficSource(
  referrer: string,
  currentUrl: string,
  utmMedium?: string | null,
  utmSource?: string | null,
): TrafficSource {
  // Email UTM takes priority over everything else (we stamp our own links)
  if (utmMedium === 'email') return 'email';
  if (utmSource && /email|newsletter|digest/i.test(utmSource)) return 'email';

  if (!referrer || referrer.trim() === '') return 'direct';

  // Normalize Google AMP cache URLs (cdn.ampproject.org/c/s/tldrsec.app/...)
  // and in-app browser schemes (android-app://com.google.android.googlequicksearchbox)
  let refUrl: URL;
  try {
    // android-app://... comes from Google app and similar in-app browsers — treat as organic
    if (referrer.startsWith('android-app://')) {
      const pkg = referrer.slice('android-app://'.length).split('/')[0].toLowerCase();
      if (pkg.includes('google')) return 'organic';
      if (pkg.includes('twitter') || pkg.includes('facebook') || pkg.includes('reddit') || pkg.includes('linkedin')) {
        return 'social';
      }
      return 'direct';
    }
    refUrl = new URL(referrer);
  } catch {
    return 'direct';
  }

  let currentUrlObj: URL | null = null;
  try {
    currentUrlObj = new URL(currentUrl);
  } catch {
    // no-op; we'll just skip the same-origin check
  }

  // Same-origin referrer = internal navigation, not a new session
  if (currentUrlObj && refUrl.hostname === currentUrlObj.hostname) {
    return 'internal';
  }

  const host = refUrl.hostname.toLowerCase();

  // Google AMP Cache — referrer is cdn.ampproject.org, treat as organic Google
  if (host === 'cdn.ampproject.org' || host.endsWith('.ampproject.org')) return 'organic';

  if (hostnameMatches(host, SEARCH_DOMAINS)) return 'organic';
  if (hostnameMatches(host, SOCIAL_DOMAINS)) return 'social';

  return 'direct';
}
