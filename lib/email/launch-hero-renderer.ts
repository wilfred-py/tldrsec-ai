/**
 * 2026-05 launch hero renderer.
 *
 * The admin /campaign/send route's default path uses getCampaignEmailContent
 * (inline HTML strings, no founderNote slot). The Wed 2026-05-20 launch needs
 * a different shape: render React Email's CampaignDemoTemplate to HTML so the
 * 'letter' founderNoteVariant + per-subscriber tldrsec.app trial CTA both wire
 * through. This module is the seam.
 *
 * Only invoked when the route is in region mode AND emailNumber === 1.
 */

import * as React from 'react';
import { renderAsync } from '@react-email/render';
import { CampaignDemoTemplate } from '@/components/ui/email/templates/campaign-demo-template';
import { buildCampaignUrl } from '@/lib/email/url-utils';
import {
  LAUNCH_VRT_PAYLOAD,
  LAUNCH_SUBJECT,
  LAUNCH_FOUNDER_NOTE,
} from '@/lib/email/__fixtures__/launch-2026-05-vrt';

export interface RenderLaunchHeroOptions {
  /** Supabase newsletter_subscribers.id (UUID). Drives ?sub= + PostHog stitch. */
  subscriberId: string;
  /** Unsubscribe URL (token-signed) for the EmailFooter + List-Unsubscribe header. */
  unsubscribeUrl: string;
}

export interface RenderedLaunchHero {
  subject: string;
  html: string;
  /** Plain-text fallback. Resend renders both. */
  text: string;
}

/**
 * Render the VRT 10-Q hero email for one subscriber. Subject is constant;
 * HTML body is personalized via subscriberId in the trial CTA URL.
 */
export async function renderLaunchHero(
  options: RenderLaunchHeroOptions,
): Promise<RenderedLaunchHero> {
  const signupUrl = buildCampaignUrl({
    subscriberId: options.subscriberId,
    emailId: 'e1',
    path: '/sign-up',
  });

  const element = React.createElement(CampaignDemoTemplate, {
    ticker: LAUNCH_VRT_PAYLOAD.ticker,
    companyName: LAUNCH_VRT_PAYLOAD.companyName,
    filingType: LAUNCH_VRT_PAYLOAD.filingType,
    filingDate: LAUNCH_VRT_PAYLOAD.filingDate,
    filerName: LAUNCH_VRT_PAYLOAD.filerName,
    filerRole: LAUNCH_VRT_PAYLOAD.filerRole,
    signalLevel: LAUNCH_VRT_PAYLOAD.signalLevel,
    signalVerdict: LAUNCH_VRT_PAYLOAD.signalVerdict,
    signalDescription: LAUNCH_VRT_PAYLOAD.signalDescription,
    summaryText: LAUNCH_VRT_PAYLOAD.summaryText,
    transactions: LAUNCH_VRT_PAYLOAD.transactions,
    founderNote: LAUNCH_FOUNDER_NOTE,
    founderNoteVariant: 'letter',
    unsubscribeUrl: options.unsubscribeUrl,
    signupUrl,
  });

  const html = await renderAsync(element);

  // Plain-text fallback: derive a deterministic, scannable version from the
  // structured payload + founder note. Resend uses this for clients that
  // disable HTML and for some spam-filter heuristics.
  const text = [
    `${LAUNCH_VRT_PAYLOAD.ticker} ${LAUNCH_VRT_PAYLOAD.filingType} · ${LAUNCH_VRT_PAYLOAD.filingDate}`,
    `${LAUNCH_VRT_PAYLOAD.signalLevel} SIGNAL · ${LAUNCH_VRT_PAYLOAD.signalVerdict}`,
    LAUNCH_VRT_PAYLOAD.signalDescription,
    '',
    LAUNCH_VRT_PAYLOAD.summaryText,
    '',
    ...LAUNCH_VRT_PAYLOAD.transactions.map(t => `${t.label}: ${t.value}`),
    '',
    LAUNCH_FOUNDER_NOTE,
    '',
    `Start your 7-day free trial: ${signupUrl}`,
    '',
    `Unsubscribe: ${options.unsubscribeUrl}`,
  ].join('\n');

  return { subject: LAUNCH_SUBJECT, html, text };
}
