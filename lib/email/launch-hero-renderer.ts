/**
 * 2026-05 launch hero renderer.
 *
 * Routes the Wed-or-later waitlist broadcast through Form10QMinimalistTemplate
 * (the actual PR1 design language signed off on with NVIDIA 10-K + Chipotle
 * 10-Q test sends) instead of the generic admin send route's inline-HTML path.
 *
 * The template's new props:
 *   - `founderNote` + `founderNoteVariant='letter'` attach a personal letter
 *     after the SEC link + materiality rationale block.
 *   - `founderNoteSignoff` renders "Founder, tldrSEC / Wilf" on two lines
 *     AFTER the launchCta button.
 *   - `launchCta` renders the per-subscriber "Start your 7-day free trial"
 *     button between body and signoff, AND suppresses the generic
 *     "Want more filings like this?" CTA so the broadcast has exactly one
 *     button.
 *   - `suppressStaleness` skips the StalenessBanner (filing is 28+ days old
 *     by deliberate choice for the launch, not a delivery delay).
 *
 * Only invoked when the admin send route is in region mode AND emailNumber === 1.
 */

import * as React from 'react';
import { renderAsync } from '@react-email/render';
import { Form10QMinimalistTemplate } from '@/components/ui/email/templates/10q-minimalist-template';
import { buildCampaignUrl } from '@/lib/email/url-utils';
import {
  LAUNCH_VRT_FILING,
  LAUNCH_SUBJECT,
  LAUNCH_FOUNDER_NOTE,
  LAUNCH_FOUNDER_SIGNOFF,
  LAUNCH_CTA_TEXT,
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
 * HTML body is personalized via subscriberId in the CTA URL.
 */
export async function renderLaunchHero(
  options: RenderLaunchHeroOptions,
): Promise<RenderedLaunchHero> {
  const signupUrl = buildCampaignUrl({
    subscriberId: options.subscriberId,
    emailId: 'e1',
    path: '/sign-up',
  });

  const element = React.createElement(Form10QMinimalistTemplate, {
    filing: LAUNCH_VRT_FILING,
    founderNote: LAUNCH_FOUNDER_NOTE,
    founderNoteVariant: 'letter' as const,
    founderNoteSignoff: LAUNCH_FOUNDER_SIGNOFF,
    launchCta: { text: LAUNCH_CTA_TEXT, url: signupUrl },
    suppressStaleness: true,
  });

  const html = await renderAsync(element);

  // Plain-text fallback. Matches the rendered structure top-to-bottom so
  // text-only readers get the same content density.
  const summaryData = LAUNCH_VRT_FILING.summaryData as {
    summary?: string;
    whyItMatters?: string;
    financialHighlights?: Array<{
      label: string;
      value: string;
      priorValue?: string;
      change?: string;
      qoqChange?: string;
    }>;
  };
  const text = [
    `${LAUNCH_VRT_FILING.symbol} ${LAUNCH_VRT_FILING.filingType} · ${LAUNCH_VRT_FILING.filingDate}`,
    LAUNCH_VRT_FILING.companyName,
    '',
    'HIGH MATERIALITY',
    '',
    summaryData.summary ?? '',
    '',
    'EARNINGS SCORECARD',
    ...(summaryData.financialHighlights ?? []).map((h) =>
      `  ${h.label}: ${h.priorValue ? `${h.priorValue} -> ` : ''}${h.value}${
        h.change ? ` (${h.change} YoY` : ''
      }${h.qoqChange ? `, ${h.qoqChange} QoQ)` : h.change ? ')' : ''}`,
    ),
    '',
    'WHY IT MATTERS',
    summaryData.whyItMatters ?? '',
    '',
    'A NOTE FROM THE FOUNDER',
    LAUNCH_FOUNDER_NOTE,
    '',
    `${LAUNCH_CTA_TEXT}: ${signupUrl}`,
    '',
    LAUNCH_FOUNDER_SIGNOFF,
    '',
    `View original filing: ${LAUNCH_VRT_FILING.filingUrl}`,
    '',
    `Unsubscribe: ${options.unsubscribeUrl}`,
  ].join('\n');

  return { subject: LAUNCH_SUBJECT, html, text };
}
