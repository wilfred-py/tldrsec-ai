import * as React from 'react';
import { FilingTemplateData } from '../../../lib/email/types';
import { TemplateRegistry } from '@/lib/email/template-registry';

interface SECFilingEmailTemplateProps {
  filing: FilingTemplateData;
}

export default function SECFilingEmailTemplate({ filing }: SECFilingEmailTemplateProps) {
  const Template = TemplateRegistry.getTemplate(filing.filingType);
  return <Template filing={filing} />;
}
