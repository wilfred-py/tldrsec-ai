import { FilingType } from '../types';

/**
 * Base interface for all filing filters
 * Generic T represents the type of object being filtered
 */
export interface FilingFilter<T = any> {
  /**
   * Apply the filter to a list of filings
   * @param filings Array of filings to filter
   * @returns Filtered array of filings
   */
  apply(filings: T[]): T[];
  
  /**
   * Get a description of the filter
   * @returns Description string
   */
  getDescription(): string;
}

/**
 * Filter filings by form type
 */
export class FormTypeFilter<T extends { filingType?: string }> implements FilingFilter<T> {
  private formTypes: FilingType[];
  
  constructor(formTypes: FilingType | FilingType[]) {
    this.formTypes = Array.isArray(formTypes) ? formTypes : [formTypes];
  }
  
  apply(filings: T[]): T[] {
    return filings.filter(filing => 
      filing.filingType && this.formTypes.includes(filing.filingType as FilingType)
    );
  }
  
  getDescription(): string {
    return `Form types: ${this.formTypes.join(', ')}`;
  }
}

/**
 * Filter filings by date range
 */
export class DateRangeFilter<T extends { filingDate?: Date }> implements FilingFilter<T> {
  private startDate?: Date;
  private endDate?: Date;
  
  constructor(options: { startDate?: Date | string; endDate?: Date | string }) {
    this.startDate = options.startDate ? new Date(options.startDate) : undefined;
    this.endDate = options.endDate ? new Date(options.endDate) : undefined;
  }
  
  apply(filings: T[]): T[] {
    return filings.filter(filing => {
      if (!filing.filingDate) return false;
      
      const filingDate = filing.filingDate instanceof Date 
        ? filing.filingDate 
        : new Date(filing.filingDate);
      
      if (this.startDate && filingDate < this.startDate) return false;
      if (this.endDate && filingDate > this.endDate) return false;
      
      return true;
    });
  }
  
  getDescription(): string {
    const start = this.startDate ? this.startDate.toISOString().substring(0, 10) : 'any';
    const end = this.endDate ? this.endDate.toISOString().substring(0, 10) : 'any';
    return `Date range: ${start} to ${end}`;
  }
}

/**
 * Filter filings by ticker symbol
 */
export class TickerFilter<T extends { ticker?: string }> implements FilingFilter<T> {
  private tickers: string[];
  
  constructor(tickers: string | string[]) {
    this.tickers = Array.isArray(tickers) ? tickers : [tickers];
    // Normalize tickers
    this.tickers = this.tickers.map(ticker => ticker.trim().toUpperCase());
  }
  
  apply(filings: T[]): T[] {
    return filings.filter(filing => 
      filing.ticker && this.tickers.includes(filing.ticker.toUpperCase())
    );
  }
  
  getDescription(): string {
    return `Tickers: ${this.tickers.join(', ')}`;
  }
}

/**
 * Filter filings by company name (partial match)
 */
export class CompanyNameFilter<T extends { companyName?: string }> implements FilingFilter<T> {
  private companyName: string;
  private caseSensitive: boolean;
  
  constructor(companyName: string, options: { caseSensitive?: boolean } = {}) {
    this.companyName = companyName;
    this.caseSensitive = options.caseSensitive || false;
  }
  
  apply(filings: T[]): T[] {
    return filings.filter(filing => {
      if (!filing.companyName) return false;
      
      if (this.caseSensitive) {
        return filing.companyName.includes(this.companyName);
      } else {
        return filing.companyName.toLowerCase().includes(this.companyName.toLowerCase());
      }
    });
  }
  
  getDescription(): string {
    return `Company name contains: ${this.companyName}`;
  }
}

// Type for filings that might include all possible filter properties
export type FilingWithAllProperties = {
  filingType?: string;
  filingDate?: Date;
  ticker?: string;
  companyName?: string;
};

/**
 * Composite filter that combines multiple filters with AND logic
 */
export class CompositeFilter<T> implements FilingFilter<T> {
  private filters: FilingFilter<T>[];
  
  constructor(filters: FilingFilter<T>[]) {
    this.filters = filters;
  }
  
  apply(filings: T[]): T[] {
    // Apply each filter in sequence
    let result = filings;
    for (const filter of this.filters) {
      result = filter.apply(result);
    }
    return result;
  }
  
  getDescription(): string {
    return this.filters.map(filter => filter.getDescription()).join(' AND ');
  }
}

/**
 * Filter builder for creating complex filters with a fluent API
 */
export class FilingFilterBuilder<T extends FilingWithAllProperties> {
  private filters: FilingFilter<T>[] = [];
  
  /**
   * Add a form type filter
   */
  withFormTypes(formTypes: FilingType | FilingType[]): FilingFilterBuilder<T> {
    this.filters.push(new FormTypeFilter<T>(formTypes));
    return this;
  }
  
  /**
   * Add a date range filter
   */
  withDateRange(options: { startDate?: Date | string; endDate?: Date | string }): FilingFilterBuilder<T> {
    this.filters.push(new DateRangeFilter<T>(options));
    return this;
  }
  
  /**
   * Add a ticker filter
   */
  withTickers(tickers: string | string[]): FilingFilterBuilder<T> {
    this.filters.push(new TickerFilter<T>(tickers));
    return this;
  }
  
  /**
   * Add a company name filter
   */
  withCompanyName(companyName: string, options?: { caseSensitive?: boolean }): FilingFilterBuilder<T> {
    this.filters.push(new CompanyNameFilter<T>(companyName, options));
    return this;
  }
  
  /**
   * Add a custom filter
   */
  withCustomFilter(filter: FilingFilter<T>): FilingFilterBuilder<T> {
    this.filters.push(filter);
    return this;
  }
  
  /**
   * Build the composite filter
   */
  build(): FilingFilter<T> {
    if (this.filters.length === 0) {
      throw new Error('No filters added to builder');
    }
    
    if (this.filters.length === 1) {
      return this.filters[0];
    }
    
    return new CompositeFilter<T>(this.filters);
  }
} 