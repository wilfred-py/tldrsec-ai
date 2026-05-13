/**
 * Filing Type Registry
 *
 * Central registry for SEC filing types and their parsing configuration.
 * All supported types are registered here — no separate registration modules needed.
 */

import { SECFilingParserOptions } from './sec-filing-parser';
import { ParsedSECFiling } from './sec-filing-parser';

/**
 * Configuration for a filing type, including important sections
 * and custom parsing options
 */
export interface FilingSectionConfig {
  /** Important sections to extract from this filing type */
  importantSections: string[];

  /** Optional custom parser options for this filing type */
  parserOptions?: Partial<SECFilingParserOptions>;

  /** Optional custom parser function for specialized processing */
  customParser?: (html: string, options?: Partial<SECFilingParserOptions>) => ParsedSECFiling;

  /** Description of this filing type */
  description?: string;
}

/**
 * Registry for SEC filing types and their configurations
 */
export class FilingTypeRegistry {
  /** Internal registry mapping filing types to their configurations */
  private static registry: Map<string, FilingSectionConfig> = new Map([
    [
      '10-K',
      {
        importantSections: [
          "Management's Discussion and Analysis",
          'Risk Factors',
          'Financial Statements',
          'Notes to Financial Statements',
          'Controls and Procedures',
          'Quantitative and Qualitative Disclosures about Market Risk',
          'Executive Compensation',
          'Business',
        ],
        parserOptions: {
          extractTables: true,
          maxSectionLength: 100000,
          preserveWhitespace: false,
        },
        description:
          "Annual report providing a comprehensive overview of a company's business and financial condition",
      },
    ],
    [
      '10-Q',
      {
        importantSections: [
          "Management's Discussion and Analysis",
          'Risk Factors',
          'Financial Statements',
          'Notes to Financial Statements',
          'Controls and Procedures',
          'Quantitative and Qualitative Disclosures about Market Risk',
        ],
        parserOptions: {
          extractTables: true,
          maxSectionLength: 75000,
          preserveWhitespace: false,
        },
        description: "Quarterly report providing ongoing view of a company's financial position",
      },
    ],
    [
      '8-K',
      {
        importantSections: [
          'Item 1.01', // Entry into a Material Definitive Agreement
          'Item 2.01', // Completion of Acquisition or Disposition of Assets
          'Item 5.02', // Departure of Directors or Certain Officers
          'Item 7.01', // Regulation FD Disclosure
          'Item 8.01', // Other Events
          'Item 9.01', // Financial Statements and Exhibits
        ],
        parserOptions: {
          extractTables: true,
          maxSectionLength: 50000,
          preserveWhitespace: false,
        },
        description: 'Current report disclosing material events that shareholders should know about',
      },
    ],
    [
      'Form4',
      {
        importantSections: [
          'Table I', // Non-Derivative Securities Acquired, Disposed of, or Beneficially Owned
          'Table II', // Derivative Securities Acquired, Disposed of, or Beneficially Owned
          'Reporting Owner',
          'Transactions',
        ],
        parserOptions: {
          extractTables: true,
          maxSectionLength: 25000,
          preserveWhitespace: false,
        },
        description: 'Statement of changes in beneficial ownership of securities by insiders',
      },
    ],
    [
      'DEFA14A',
      {
        importantSections: [
          'Additional Information',
          'Supplemental Information',
          'Forward-Looking Statements',
          'Voting Instructions',
          'Presentation Materials',
          'Important Information',
        ],
        parserOptions: {
          extractTables: true,
          maxSectionLength: 60000,
          preserveWhitespace: false,
        },
        description:
          'Additional proxy soliciting materials that are provided to shareholders regarding a matter to be voted on',
      },
    ],
    [
      'SC 13D',
      {
        importantSections: [
          'Item 1. Security and Issuer',
          'Item 2. Identity and Background',
          'Item 3. Source and Amount of Funds',
          'Item 4. Purpose of Transaction',
          'Item 5. Interest in Securities',
          'Item 6. Contracts, Arrangements, Understandings',
          'Item 7. Material to be Filed as Exhibits',
        ],
        parserOptions: {
          extractTables: true,
          maxSectionLength: 50000,
          preserveWhitespace: false,
        },
        description:
          "Filed when an entity acquires more than 5% of voting class of a company's securities",
      },
    ],
    [
      '144',
      {
        importantSections: [
          'Issuer Information',
          'Security Information',
          'Person for whose Account the Securities are to be Sold',
          'Broker Information',
          'Proposed Sale Information',
        ],
        parserOptions: {
          extractTables: true,
          maxSectionLength: 25000,
          preserveWhitespace: false,
        },
        description: 'Notice of proposed sale of restricted securities by affiliates',
      },
    ],
  ]);

  // Aliases registered after the primary entries above
  static {
    // Form 4 alias
    this.registry.set('4', this.registry.get('Form4')!);

    // DEFA14A alias
    this.registry.set('DEFA 14A', this.registry.get('DEFA14A')!);

    // SC 13D alias
    this.registry.set('SC13D', this.registry.get('SC 13D')!);

    // Form 144 alias
    this.registry.set('Form 144', this.registry.get('144')!);
  }

  /**
   * Register a new filing type with its section configuration
   *
   * @param type Filing type identifier (e.g., '10-K', 'DEF 14A')
   * @param config Configuration for this filing type
   */
  static register(type: string, config: FilingSectionConfig): void {
    this.registry.set(type, config);
  }

  /**
   * Check if a filing type is supported by the registry
   *
   * @param type Filing type to check
   * @returns True if the filing type is registered
   */
  static isSupported(type: string): boolean {
    return this.registry.has(type);
  }

  /**
   * Get the section configuration for a filing type
   *
   * @param type Filing type to lookup
   * @returns Configuration for the filing type or undefined if not supported
   */
  static getSectionConfig(type: string): FilingSectionConfig | undefined {
    return this.registry.get(type);
  }

  /**
   * Get important sections for a filing type
   *
   * @param type Filing type to lookup
   * @returns Array of important section names or empty array if not supported
   */
  static getImportantSections(type: string): string[] {
    return this.registry.get(type)?.importantSections || [];
  }

  /**
   * Get all supported filing types
   *
   * @returns Array of all registered filing type identifiers
   */
  static getAllTypes(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Get a map of all filing types and their descriptions
   *
   * @returns Map of filing types to their descriptions
   */
  static getFilingTypeDescriptions(): Map<string, string> {
    const descriptions = new Map<string, string>();

    this.registry.forEach((config, type) => {
      descriptions.set(type, config.description || `${type} SEC Filing`);
    });

    return descriptions;
  }
}
