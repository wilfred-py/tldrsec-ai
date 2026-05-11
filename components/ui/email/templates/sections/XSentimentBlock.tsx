/**
 * XSentimentBlock — server-rendered wrapper around XSentimentSection.
 *
 * SERVER-ONLY. Do not import into `'use client'` components — this module
 * pulls in `lib/monitoring` which transitively requires the server-only
 * Prisma graph (see wiki/product/x-sentiment-enrichment.md "Architectural
 * smell carried forward"). All current callers are SEC filing email
 * templates rendered via react-email/render inside cron-handler code.
 *
 * Responsibilities (per /review_plan Issues 5A + 4A + 16A):
 *   1. Cast the raw `summaryData.xSentiment` payload to the section's prop shape.
 *   2. Apply `shouldRenderXSentiment` defense-in-depth guard.
 *   3. Emit `email.x_sentiment_section_rendered{form_type}` counter on render.
 *   4. Wrap `XSentimentSection` in the same outer `<table>` + spacer rows that
 *      every existing template duplicates inline today (Issue 5A — DRY).
 *
 * Lifts ~12 lines of identical boilerplate out of every template that wants
 * to render the section. Templates now use a single JSX line:
 *
 *   <XSentimentBlock rawData={rawData} formType="Form 4" />
 */
import * as React from 'react';
import { XSentimentSection, shouldRenderXSentiment } from './XSentimentSection';
import type { FilingTemplateData } from '../../../../../lib/email/types';
import { monitoring } from '../../../../../lib/monitoring';

/**
 * String-literal union over every form-type counter label that currently
 * has a template wired (Issue 16A — TypeScript locks counter cardinality).
 * Adding a new template? Add the literal here and TypeScript will require
 * the call-site to pass it.
 */
export type XSentimentFormType =
  | '10-K'
  | '10-Q'
  | '8-K'
  | 'Form 4'
  | 'Form 144'
  | 'DEF 14A'
  | 'S-1'
  | 'S-3'
  | 'Generic';

interface XSentimentBlockProps {
  /** Raw `summaryData` payload from the filing — same shape templates already use. */
  rawData: FilingTemplateData['summaryData'] | undefined | null;
  /** Bounded literal — feeds counter cardinality and never originates from EDGAR. */
  formType: XSentimentFormType;
}

/**
 * Render the X sentiment block when the payload survives `shouldRenderXSentiment`.
 *
 * Side effect: emits `email.x_sentiment_section_rendered` with the form-type
 * tag during render. This is a server-only side effect during react-email
 * synchronous SSR — benign in this context. Counter cardinality is bounded
 * by `XSentimentFormType`.
 */
export function XSentimentBlock({ rawData, formType }: XSentimentBlockProps): React.ReactElement | null {
  const xSentiment = rawData?.xSentiment as
    NonNullable<FilingTemplateData['summaryData']>['xSentiment'] | undefined;

  if (!shouldRenderXSentiment(xSentiment)) {
    return null;
  }

  // Bounded counter — form_type is a string-literal union, never EDGAR-derived.
  monitoring.incrementCounter('email.x_sentiment_section_rendered', 1, {
    form_type: formType,
  });

  return (
    <table width="100%" cellPadding="0" cellSpacing="0" data-testid="x-sentiment-section">
      <tbody>
        <XSentimentSection
          direction={xSentiment.direction}
          shift={xSentiment.shift}
          confidence={xSentiment.confidence}
          discussionSynthesis={xSentiment.discussionSynthesis}
          factClaims={xSentiment.factClaims}
          citationUrls={xSentiment.citationUrls}
          windowHours={xSentiment.windowHours}
        />
        <tr><td style={{ height: '20px', lineHeight: '20px', fontSize: 0 }}>&nbsp;</td></tr>
      </tbody>
    </table>
  );
}

export default XSentimentBlock;
