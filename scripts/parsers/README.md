# Parser Scripts

This directory contains scripts for testing and demonstrating the parsing of various SEC filing types.

## Available Scripts

- **test-content-extraction.js/.ts**: Demonstrates the unified content extraction strategy for different SEC filing types (10-K, 10-Q, 8-K, PDF, XBRL)
- **test-xbrl-parser.js**: Tests the XBRL parsing functionality
- **test-tesla-filings.js**: Tests parsing of Tesla's SEC filings
- **test-tesla-simple.js**: Simplified test for Tesla's SEC filings

## Running the Scripts

```bash
# For content extraction testing
npm run test:extraction    # JS version
npm run test:extraction:ts # TS version

# For XBRL parsing
npm run test:xbrl

# For Tesla filings testing
npm run test:tesla
npm run test:tesla:simple
```

## Output Directories

- **tesla-filing-results/**: Contains output files from Tesla filing tests 