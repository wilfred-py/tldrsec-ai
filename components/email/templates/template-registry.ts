import { ComponentType } from 'react';
import { FilingTemplateData } from '../../../lib/email/types';

// Import templates
import Form4MinimalistTemplate from '../../ui/email/templates/form4-minimalist-template';
import Form10KMinimalistTemplate from '../../ui/email/templates/10k-minimalist-template';
import Form10QMinimalistTemplate from '../../ui/email/templates/10q-minimalist-template';
import Form8KMinimalistTemplate from '../../ui/email/templates/8k-minimalist-template';
import GenericMinimalistTemplate from '../../ui/email/templates/generic-minimalist-template';
import Form11KEmailTemplate from '../../ui/email/templates/11k-template';
import Form144MinimalistTemplate from '../../ui/email/templates/form144-minimalist-template';
import FormDEF14AEmailTemplate from '../../ui/email/templates/def14a-template';
import Schedule13DEmailTemplate from '../../ui/email/templates/13d-template';

interface TemplateProps {
  filing: FilingTemplateData;
}

type TemplateComponent = ComponentType<TemplateProps>;

// Template registry for O(1) lookup
const templateRegistry = new Map<string, TemplateComponent>([
  // Insider trading forms (top priority)
  ['Form 3', Form4MinimalistTemplate],
  ['Form 4', Form4MinimalistTemplate],
  ['Form 5', Form4MinimalistTemplate],
  ['3', Form4MinimalistTemplate],
  ['4', Form4MinimalistTemplate],
  ['5', Form4MinimalistTemplate],

  // Annual reports
  ['10-K', Form10KMinimalistTemplate],
  ['Form 10-K', Form10KMinimalistTemplate],

  // Quarterly reports
  ['10-Q', Form10QMinimalistTemplate],
  ['Form 10-Q', Form10QMinimalistTemplate],

  // Current reports (8-K - material events)
  ['8-K', Form8KMinimalistTemplate],
  ['8K', Form8KMinimalistTemplate],
  ['Form 8-K', Form8KMinimalistTemplate],
  ['FORM 8-K', Form8KMinimalistTemplate],

  // Specialized templates
  ['Form 11-K', Form11KEmailTemplate],
  ['144', Form144MinimalistTemplate],
  ['Form 144', Form144MinimalistTemplate],
  ['DEF 14A', FormDEF14AEmailTemplate],
  ['Form DEF 14A', FormDEF14AEmailTemplate],
  ['Schedule 13D', Schedule13DEmailTemplate],
]);

/**
 * Get the appropriate email template for a given filing type
 * @param filingType The type of SEC filing
 * @returns The template component or generic template as fallback
 */
export function getTemplate(filingType: string): TemplateComponent {
  return templateRegistry.get(filingType) || GenericMinimalistTemplate;
}

/**
 * Register a custom template for a filing type
 * @param filingType The filing type to register
 * @param template The template component to use
 */
export function registerTemplate(filingType: string, template: TemplateComponent): void {
  templateRegistry.set(filingType, template);
}

/**
 * Check if a filing type has a specialized template
 * @param filingType The filing type to check
 * @returns True if a specialized template exists
 */
export function hasSpecializedTemplate(filingType: string): boolean {
  return templateRegistry.has(filingType);
}