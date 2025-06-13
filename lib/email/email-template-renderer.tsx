import ReactDOMServer from 'react-dom/server';
import SECFilingEmailTemplate from '../../assets/sec-email-template/email-template';
import { FilingSummaryResult } from '../../services/filingService';

// This is a placeholder for the props the templates will need.
// We will need to adjust this based on the actual props required by the templates.
interface TemplateProps {
  summaries: FilingSummaryResult[];
  errors: { ticker: string; error: string }[];
}

export function renderEmailTemplate(props: TemplateProps): string {
  const emailComponent = <SECFilingEmailTemplate {...props} />;
  const html = ReactDOMServer.renderToStaticMarkup(emailComponent);
  return `<!DOCTYPE html>${html}`;
}
