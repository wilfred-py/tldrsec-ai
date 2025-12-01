import * as React from 'react';
import { FilingTemplateData } from '../../../lib/email/types';
import { getTemplate } from './template-registry';

interface SECFilingEmailTemplateProps {
  filing: FilingTemplateData;
}

export default function SECFilingEmailTemplate({ filing }: SECFilingEmailTemplateProps) {
  // Use template registry for O(1) lookup performance
  const Template = getTemplate(filing.filingType);
  return <Template filing={filing} />;
}
