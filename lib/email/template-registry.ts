/**
 * Centralized Template Registry
 *
 * Provides O(1) lookup for email templates based on filing type.
 * Consolidates all template mappings in one place for consistency.
 *
 * Part of Phase 3: Template and Email Consistency improvements
 */

import { ComponentType } from 'react';
import { FilingTemplateData } from './types';

// Import templates - using named exports where available, default exports otherwise
import { Form4MinimalistTemplate } from '@/components/ui/email/templates/form4-minimalist-template';
import { Form10KMinimalistTemplate } from '@/components/ui/email/templates/10k-minimalist-template';
import { Form10QMinimalistTemplate } from '@/components/ui/email/templates/10q-minimalist-template';
import { Form8KMinimalistTemplate } from '@/components/ui/email/templates/8k-minimalist-template';
import { GenericMinimalistTemplate } from '@/components/ui/email/templates/generic-minimalist-template';
import { Form144MinimalistTemplate } from '@/components/ui/email/templates/form144-minimalist-template';
import FormDEF14AEmailTemplate from '@/components/ui/email/templates/def14a-template';
import Schedule13DEmailTemplate from '@/components/ui/email/templates/13d-template';

/**
 * Props interface for filing email templates
 */
interface TemplateProps {
  filing: FilingTemplateData;
}

/**
 * Template component type with displayName for testing
 */
type TemplateComponent = ComponentType<TemplateProps> & {
  displayName?: string;
};

/**
 * Wrapper to add displayName to templates for testing
 */
function wrapTemplate(
  template: ComponentType<TemplateProps>,
  displayName: string
): TemplateComponent {
  const wrapped = template as TemplateComponent;
  wrapped.displayName = displayName;
  return wrapped;
}

/**
 * Template registry Map for O(1) lookup
 *
 * Maps all form type variations to their appropriate templates.
 * Includes:
 * - Insider trading forms (Form 3, 4, 5)
 * - Annual reports (10-K)
 * - Quarterly reports (10-Q)
 * - Current reports (8-K)
 * - Notice of sale (Form 144)
 * - Proxy statements (DEF 14A)
 * - Ownership reports (Schedule 13D)
 */
const templateMap = new Map<string, TemplateComponent>([
  // Form 4 and related insider trading forms
  ['Form 3', wrapTemplate(Form4MinimalistTemplate, 'Form4MinimalistTemplate')],
  ['Form 4', wrapTemplate(Form4MinimalistTemplate, 'Form4MinimalistTemplate')],
  ['Form 5', wrapTemplate(Form4MinimalistTemplate, 'Form4MinimalistTemplate')],
  ['FORM 3', wrapTemplate(Form4MinimalistTemplate, 'Form4MinimalistTemplate')],
  ['FORM 4', wrapTemplate(Form4MinimalistTemplate, 'Form4MinimalistTemplate')],
  ['FORM 5', wrapTemplate(Form4MinimalistTemplate, 'Form4MinimalistTemplate')],
  ['FORM4', wrapTemplate(Form4MinimalistTemplate, 'Form4MinimalistTemplate')],
  ['3', wrapTemplate(Form4MinimalistTemplate, 'Form4MinimalistTemplate')],
  ['4', wrapTemplate(Form4MinimalistTemplate, 'Form4MinimalistTemplate')],
  ['5', wrapTemplate(Form4MinimalistTemplate, 'Form4MinimalistTemplate')],

  // 10-K Annual Reports
  ['10-K', wrapTemplate(Form10KMinimalistTemplate, 'Form10KMinimalistTemplate')],
  ['10K', wrapTemplate(Form10KMinimalistTemplate, 'Form10KMinimalistTemplate')],
  ['Form 10-K', wrapTemplate(Form10KMinimalistTemplate, 'Form10KMinimalistTemplate')],
  ['FORM 10-K', wrapTemplate(Form10KMinimalistTemplate, 'Form10KMinimalistTemplate')],

  // 10-Q Quarterly Reports
  ['10-Q', wrapTemplate(Form10QMinimalistTemplate, 'Form10QMinimalistTemplate')],
  ['10Q', wrapTemplate(Form10QMinimalistTemplate, 'Form10QMinimalistTemplate')],
  ['Form 10-Q', wrapTemplate(Form10QMinimalistTemplate, 'Form10QMinimalistTemplate')],
  ['FORM 10-Q', wrapTemplate(Form10QMinimalistTemplate, 'Form10QMinimalistTemplate')],

  // 8-K Current Reports (material events)
  ['8-K', wrapTemplate(Form8KMinimalistTemplate, 'Form8KMinimalistTemplate')],
  ['8K', wrapTemplate(Form8KMinimalistTemplate, 'Form8KMinimalistTemplate')],
  ['Form 8-K', wrapTemplate(Form8KMinimalistTemplate, 'Form8KMinimalistTemplate')],
  ['FORM 8-K', wrapTemplate(Form8KMinimalistTemplate, 'Form8KMinimalistTemplate')],
  ['FORM8-K', wrapTemplate(Form8KMinimalistTemplate, 'Form8KMinimalistTemplate')],

  // Form 144 Notice of Proposed Sale
  ['144', wrapTemplate(Form144MinimalistTemplate, 'Form144MinimalistTemplate')],
  ['Form 144', wrapTemplate(Form144MinimalistTemplate, 'Form144MinimalistTemplate')],
  ['FORM 144', wrapTemplate(Form144MinimalistTemplate, 'Form144MinimalistTemplate')],
  ['FORM144', wrapTemplate(Form144MinimalistTemplate, 'Form144MinimalistTemplate')],

  // DEF 14A Proxy Statements
  ['DEF 14A', wrapTemplate(FormDEF14AEmailTemplate, 'FormDEF14AEmailTemplate')],
  ['Form DEF 14A', wrapTemplate(FormDEF14AEmailTemplate, 'FormDEF14AEmailTemplate')],
  ['DEF14A', wrapTemplate(FormDEF14AEmailTemplate, 'FormDEF14AEmailTemplate')],

  // Schedule 13D Ownership Reports
  ['Schedule 13D', wrapTemplate(Schedule13DEmailTemplate, 'Schedule13DEmailTemplate')],
  ['13D', wrapTemplate(Schedule13DEmailTemplate, 'Schedule13DEmailTemplate')],
]);

// Wrap GenericMinimalistTemplate for fallback
const genericTemplate = wrapTemplate(
  GenericMinimalistTemplate,
  'GenericMinimalistTemplate'
);

/**
 * Centralized Template Registry
 *
 * Provides consistent template selection for all SEC filing types
 * with O(1) lookup performance using Map.
 */
export class TemplateRegistry {
  /**
   * Get the appropriate email template for a filing type
   *
   * @param filingType - The SEC filing type (e.g., "10-K", "Form 4", "8-K")
   * @returns The template component with displayName property
   */
  static getTemplate(filingType: string): TemplateComponent {
    return templateMap.get(filingType) || genericTemplate;
  }

  /**
   * Check if a specialized template exists for a filing type
   *
   * @param filingType - The SEC filing type to check
   * @returns True if a specialized template exists (not generic)
   */
  static hasTemplate(filingType: string): boolean {
    return templateMap.has(filingType);
  }

  /**
   * Check if the registry uses Map-based O(1) lookup
   *
   * @returns True (always uses Map for O(1) lookup)
   */
  static isMapBased(): boolean {
    return true;
  }

  /**
   * Register a custom template for a filing type
   *
   * @param filingType - The filing type to register
   * @param template - The template component
   * @param displayName - The display name for testing
   */
  static registerTemplate(
    filingType: string,
    template: ComponentType<TemplateProps>,
    displayName: string
  ): void {
    templateMap.set(filingType, wrapTemplate(template, displayName));
  }

  /**
   * Get all registered filing types
   *
   * @returns Array of all registered filing type keys
   */
  static getRegisteredTypes(): string[] {
    return Array.from(templateMap.keys());
  }
}
