/**
 * Filing email-template selection.
 *
 * One deep module behind a single function: given a [Filing] type, return the
 * minimalist email template that renders it plus its canonical analytics name.
 *
 * Before this module the same form-type -> template mapping was copied into
 * three places (`template-registry.ts`, `templates.ts`, and the filings
 * `emailGenerator.ts`). The copies drifted: the filings generator only knew 14
 * aliases and silently rendered the generic template for DEF 14A, S-1, S-3,
 * 11-K and 13D filings that the other copies had specific templates for. All
 * three now route through `selectFilingTemplate`, so a new alias is added in
 * exactly one place and every send path agrees.
 */

import { ComponentType } from 'react';
import { FilingTemplateData } from './types';

import { Form4MinimalistTemplate } from '../../components/ui/email/templates/form4-minimalist-template';
import { Form10KMinimalistTemplate } from '../../components/ui/email/templates/10k-minimalist-template';
import { Form10QMinimalistTemplate } from '../../components/ui/email/templates/10q-minimalist-template';
import { Form8KMinimalistTemplate } from '../../components/ui/email/templates/8k-minimalist-template';
import { Form144MinimalistTemplate } from '../../components/ui/email/templates/form144-minimalist-template';
import { FormDEF14AMinimalistTemplate } from '../../components/ui/email/templates/def14a-minimalist-template';
import { Form11KMinimalistTemplate } from '../../components/ui/email/templates/11k-minimalist-template';
import { FormS1MinimalistTemplate } from '../../components/ui/email/templates/s1-minimalist-template';
import { FormS3MinimalistTemplate } from '../../components/ui/email/templates/s3-minimalist-template';
import { GenericMinimalistTemplate } from '../../components/ui/email/templates/generic-minimalist-template';
import Schedule13DEmailTemplate from '../../components/ui/email/templates/13d-template';

type FilingTemplateComponent = ComponentType<{ filing: FilingTemplateData }>;

/**
 * The result of resolving a [Filing] type to a template.
 *
 * - `component`: the React component that renders the filing's email body.
 * - `name`: canonical template name, emitted as the `template` value on
 *   outbound analytics tags so events carry the template that actually rendered.
 */
export interface FilingTemplateSelection {
  component: FilingTemplateComponent;
  name: string;
}

const FORM4: FilingTemplateSelection = { component: Form4MinimalistTemplate, name: 'form4_minimalist' };
const FORM10K: FilingTemplateSelection = { component: Form10KMinimalistTemplate, name: '10k_minimalist' };
const FORM10Q: FilingTemplateSelection = { component: Form10QMinimalistTemplate, name: '10q_minimalist' };
const FORM8K: FilingTemplateSelection = { component: Form8KMinimalistTemplate, name: '8k_minimalist' };
const FORM144: FilingTemplateSelection = { component: Form144MinimalistTemplate, name: 'form144_minimalist' };
const DEF14A: FilingTemplateSelection = { component: FormDEF14AMinimalistTemplate, name: 'def14a_minimalist' };
const FORM11K: FilingTemplateSelection = { component: Form11KMinimalistTemplate, name: '11k_minimalist' };
const FORMS1: FilingTemplateSelection = { component: FormS1MinimalistTemplate, name: 's1_minimalist' };
const FORMS3: FilingTemplateSelection = { component: FormS3MinimalistTemplate, name: 's3_minimalist' };
// Legacy 13D template — routed here so outbound tags carry an accurate
// `template` value instead of falling back to generic.
const SCHEDULE13D: FilingTemplateSelection = { component: Schedule13DEmailTemplate, name: '13d_legacy' };

const GENERIC: FilingTemplateSelection = { component: GenericMinimalistTemplate, name: 'generic_minimalist' };

/**
 * Canonical alias -> template map. Keys are upper-cased and trimmed; callers
 * are normalized the same way before lookup, so case and "Form " prefixing
 * never matter. This is the union of every alias the three prior copies knew.
 * Form 3/4/5 all share the insider-trading template by design.
 */
const SELECTION_BY_FORM: Record<string, FilingTemplateSelection> = {
  'FORM 3': FORM4, 'FORM 4': FORM4, 'FORM 5': FORM4,
  'FORM3': FORM4, 'FORM4': FORM4, 'FORM5': FORM4,
  '3': FORM4, '4': FORM4, '5': FORM4,

  '10-K': FORM10K, '10K': FORM10K, 'FORM 10-K': FORM10K, 'FORM10-K': FORM10K,
  '10-Q': FORM10Q, '10Q': FORM10Q, 'FORM 10-Q': FORM10Q, 'FORM10-Q': FORM10Q,

  '8-K': FORM8K, '8K': FORM8K, 'FORM 8-K': FORM8K, 'FORM8-K': FORM8K,

  '144': FORM144, 'FORM 144': FORM144, 'FORM144': FORM144,

  'DEF 14A': DEF14A, 'FORM DEF 14A': DEF14A, 'DEF14A': DEF14A, 'DEFA14A': DEF14A,

  '11-K': FORM11K, '11K': FORM11K, 'FORM 11-K': FORM11K,

  'S-1': FORMS1, 'S1': FORMS1, 'FORM S-1': FORMS1,
  'S-3': FORMS3, 'S3': FORMS3, 'FORM S-3': FORMS3,

  'SCHEDULE 13D': SCHEDULE13D, 'SCHEDULE13D': SCHEDULE13D,
  '13D': SCHEDULE13D, 'SC 13D': SCHEDULE13D, 'SC13D': SCHEDULE13D,
};

/**
 * Resolve a [Filing] type to its email template. Unknown form types fall back
 * to the generic minimalist template, so callers always get a renderable
 * component — they never have to handle a miss.
 */
export function selectFilingTemplate(filingType: string | undefined | null): FilingTemplateSelection {
  const normalized = filingType?.toUpperCase().trim() || '';
  return SELECTION_BY_FORM[normalized] || GENERIC;
}
