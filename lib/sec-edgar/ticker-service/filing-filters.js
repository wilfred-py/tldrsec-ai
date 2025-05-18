/**
 * Filter filings by form type
 */
export class FormTypeFilter {
    constructor(formTypes) {
        this.formTypes = Array.isArray(formTypes) ? formTypes : [formTypes];
    }
    apply(filings) {
        return filings.filter(filing => filing.filingType && this.formTypes.includes(filing.filingType));
    }
    getDescription() {
        return `Form types: ${this.formTypes.join(', ')}`;
    }
}
/**
 * Filter filings by date range
 */
export class DateRangeFilter {
    constructor(options) {
        this.startDate = options.startDate ? new Date(options.startDate) : undefined;
        this.endDate = options.endDate ? new Date(options.endDate) : undefined;
    }
    apply(filings) {
        return filings.filter(filing => {
            if (!filing.filingDate)
                return false;
            const filingDate = filing.filingDate instanceof Date
                ? filing.filingDate
                : new Date(filing.filingDate);
            if (this.startDate && filingDate < this.startDate)
                return false;
            if (this.endDate && filingDate > this.endDate)
                return false;
            return true;
        });
    }
    getDescription() {
        const start = this.startDate ? this.startDate.toISOString().substring(0, 10) : 'any';
        const end = this.endDate ? this.endDate.toISOString().substring(0, 10) : 'any';
        return `Date range: ${start} to ${end}`;
    }
}
/**
 * Filter filings by ticker symbol
 */
export class TickerFilter {
    constructor(tickers) {
        this.tickers = Array.isArray(tickers) ? tickers : [tickers];
        // Normalize tickers
        this.tickers = this.tickers.map(ticker => ticker.trim().toUpperCase());
    }
    apply(filings) {
        return filings.filter(filing => filing.ticker && this.tickers.includes(filing.ticker.toUpperCase()));
    }
    getDescription() {
        return `Tickers: ${this.tickers.join(', ')}`;
    }
}
/**
 * Filter filings by company name (partial match)
 */
export class CompanyNameFilter {
    constructor(companyName, options = {}) {
        this.companyName = companyName;
        this.caseSensitive = options.caseSensitive || false;
    }
    apply(filings) {
        return filings.filter(filing => {
            if (!filing.companyName)
                return false;
            if (this.caseSensitive) {
                return filing.companyName.includes(this.companyName);
            }
            else {
                return filing.companyName.toLowerCase().includes(this.companyName.toLowerCase());
            }
        });
    }
    getDescription() {
        return `Company name contains: ${this.companyName}`;
    }
}
/**
 * Composite filter that combines multiple filters with AND logic
 */
export class CompositeFilter {
    constructor(filters) {
        this.filters = filters;
    }
    apply(filings) {
        // Apply each filter in sequence
        let result = filings;
        for (const filter of this.filters) {
            result = filter.apply(result);
        }
        return result;
    }
    getDescription() {
        return this.filters.map(filter => filter.getDescription()).join(' AND ');
    }
}
/**
 * Filter builder for creating complex filters with a fluent API
 */
export class FilingFilterBuilder {
    constructor() {
        this.filters = [];
    }
    /**
     * Add a form type filter
     */
    withFormTypes(formTypes) {
        this.filters.push(new FormTypeFilter(formTypes));
        return this;
    }
    /**
     * Add a date range filter
     */
    withDateRange(options) {
        this.filters.push(new DateRangeFilter(options));
        return this;
    }
    /**
     * Add a ticker filter
     */
    withTickers(tickers) {
        this.filters.push(new TickerFilter(tickers));
        return this;
    }
    /**
     * Add a company name filter
     */
    withCompanyName(companyName, options) {
        this.filters.push(new CompanyNameFilter(companyName, options));
        return this;
    }
    /**
     * Add a custom filter
     */
    withCustomFilter(filter) {
        this.filters.push(filter);
        return this;
    }
    /**
     * Build the composite filter
     */
    build() {
        if (this.filters.length === 0) {
            throw new Error('No filters added to builder');
        }
        if (this.filters.length === 1) {
            return this.filters[0];
        }
        return new CompositeFilter(this.filters);
    }
}
