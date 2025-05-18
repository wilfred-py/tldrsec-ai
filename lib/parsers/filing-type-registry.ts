/**
 * Filing Type Registry
 * 
 * Provides a centralized registry for SEC filing types and their configuration.
 * This allows for a more extensible and maintainable approach to handling
 * different SEC filing types.
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
  private static registry: Map<string, FilingSectionConfig> = new Map();

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