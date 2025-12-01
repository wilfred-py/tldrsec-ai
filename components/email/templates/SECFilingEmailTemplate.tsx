import * as React from 'react';
import Form11KEmailTemplate from '../../ui/email/templates/11k-template';
import Form144EmailTemplate from '../../ui/email/templates/form144-template';
import FormDEF14AEmailTemplate from '../../ui/email/templates/def14a-template';
import Schedule13DEmailTemplate from '../../ui/email/templates/13d-template';
// New minimalist templates (Morning Brew style)
import Form4MinimalistTemplate from '../../ui/email/templates/form4-minimalist-template';
import Form10KMinimalistTemplate from '../../ui/email/templates/10k-minimalist-template';
import Form10QMinimalistTemplate from '../../ui/email/templates/10q-minimalist-template';
import GenericMinimalistTemplate from '../../ui/email/templates/generic-minimalist-template';
import { FilingTemplateData } from '../../../lib/email/types';

interface SECFilingEmailTemplateProps {
  filing: FilingTemplateData;
}

export default function SECFilingEmailTemplate({ filing }: SECFilingEmailTemplateProps) {
  // Select appropriate template based on filing type
  // Priority: Minimalist templates for top 3 form types, then existing templates, then generic minimalist
  switch (filing.filingType) {
    // Top 3 filing types use new minimalist templates
    case 'Form 4':
    case 'Form 3':
    case 'Form 5':
    case '4':
    case '3':
    case '5':
      return <Form4MinimalistTemplate filing={filing} />;
    case '10-K':
    case 'Form 10-K':
      return <Form10KMinimalistTemplate filing={filing} />;
    case '10-Q':
    case 'Form 10-Q':
      return <Form10QMinimalistTemplate filing={filing} />;
    // Existing specialized templates
    case 'Form 11-K':
      return <Form11KEmailTemplate filing={filing} />;
    case 'Form 144':
      return <Form144EmailTemplate filing={filing} />;
    case 'Form DEF 14A':
      return <FormDEF14AEmailTemplate filing={filing} />;
    case 'Schedule 13D':
      return <Schedule13DEmailTemplate filing={filing} />;
    default:
      // Use generic minimalist template for all other filing types
      return <GenericMinimalistTemplate filing={filing} />;
  }
}
