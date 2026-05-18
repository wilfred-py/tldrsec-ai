/**
 * Renders the 2026-05 launch hero (VRT 10-Q + founder note) and asserts the
 * key invariants the cron-fired Wed broadcast depends on:
 *   - subject matches the locked D2 pick
 *   - founder-note v4 text is in the HTML body
 *   - founderNote signoff "Founder, tldrSEC / Wilf" survives the React→HTML render
 *   - signup URL is per-subscriber (subscriberId in the ?sub= query param)
 *   - text fallback contains the structured data + founder note
 *
 * `@react-email/render`'s renderAsync is browser-bundle in jsdom, so we
 * substitute ReactDOMServer.renderToStaticMarkup — same fundamental output,
 * works in Node test env.
 */

// Polyfill MessageChannel for react-dom/server.browser in jsdom env.
if (typeof (globalThis as any).MessageChannel === 'undefined') {
  (globalThis as any).MessageChannel = class {
    port1 = { onmessage: null as ((ev: { data: unknown }) => void) | null, postMessage: () => {} };
    port2 = { onmessage: null as ((ev: { data: unknown }) => void) | null, postMessage: () => {} };
  };
}

jest.mock('@react-email/render', () => {
  // Use @testing-library/react render to convert to HTML — works in jsdom
  // without needing browser APIs the @react-email/render browser bundle pulls in.
  const { render } = require('@testing-library/react');
  return {
    renderAsync: jest.fn(async (element: unknown) => {
      const result = render(element as React.ReactElement);
      const html = result.container.innerHTML;
      result.unmount();
      return html;
    }),
  };
});

import { renderLaunchHero } from '@/lib/email/launch-hero-renderer';
import {
  LAUNCH_SUBJECT,
  LAUNCH_FOUNDER_NOTE,
  LAUNCH_VRT_PAYLOAD,
} from '@/lib/email/__fixtures__/launch-2026-05-vrt';

describe('renderLaunchHero', () => {
  const SUB_ID = '550e8400-e29b-41d4-a716-446655440000';
  const UNSUB = 'https://tldrsec.app/unsubscribe?token=stub';

  it('returns the locked launch subject', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    expect(out.subject).toBe(LAUNCH_SUBJECT);
    expect(out.subject).toBe("The AI 10-Q most investors missed: Vertiv's backlog doubled to $15B");
  });

  it('embeds the full founder-note v4 prose in the HTML body', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    // First paragraph hook
    expect(out.html).toContain('I built tldrSEC because I care about my portfolio');
    // The 10+ hours scouring sentence (the v4 edit)
    expect(out.html).toContain('10+ hours every week scouring through Management Discussion');
    // The "confirmed by strong evidence" closer (the v4 edit)
    expect(out.html).toContain('confirmed by strong evidence in the filings');
    // The 360-degree analyst framing (the v4 edit)
    expect(out.html).toContain('equity analyst who never gets tired, never misses anything');
    // The signoff lines
    expect(out.html).toContain('Founder, tldrSEC');
    expect(out.html).toContain('Wilf');
  });

  it('contains no em-dashes anywhere in the rendered body', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    expect(out.html).not.toContain('—');
    expect(out.text).not.toContain('—');
  });

  it('embeds VRT signal headline + transaction values', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    expect(out.html).toContain(LAUNCH_VRT_PAYLOAD.signalVerdict);
    expect(out.html).toContain('$15B+');
    expect(out.html).toContain('+83%');
    expect(out.html).toContain('$1.17');
  });

  it('signup URL is per-subscriber with utm + sub params', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    expect(out.html).toContain(`sub=${SUB_ID}`);
    expect(out.html).toContain('utm_source=email');
    expect(out.html).toContain('utm_campaign=launch-2026-05');
    expect(out.html).toContain('utm_content=e1');
    expect(out.html).toContain('/sign-up');
  });

  it('renders text fallback with structured data + founder note', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    expect(out.text).toContain('VRT 10-Q');
    expect(out.text).toContain('HIGH SIGNAL');
    expect(out.text).toContain('Project backlog: $15B+');
    expect(out.text).toContain('Adjusted EPS: $1.17');
    expect(out.text).toContain(LAUNCH_FOUNDER_NOTE.split('\n')[0]); // first founder-note line
    expect(out.text).toContain('Start your 7-day free trial:');
    expect(out.text).toContain(UNSUB);
  });
});
