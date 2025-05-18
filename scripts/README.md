# TLDRSEC-AI Scripts Directory

This directory contains various scripts for testing and demonstrating the functionality of the TLDRSEC-AI application.

## Script Categories

### SEC Filing Parser Tests

These scripts test the parsing and extraction of content from SEC filings:

- **test-content-extraction.js/.ts**: Demonstrates the unified content extraction strategy for different SEC filing types (10-K, 10-Q, 8-K, PDF, XBRL)
- **test-xbrl-parser.js**: Tests the XBRL parsing functionality
- **test-pdf-parser.js**: Tests the PDF parsing functionality
- **test-tesla-filings.js**: Tests parsing of Tesla's SEC filings
- **test-tesla-simple.js**: Simplified test for Tesla's SEC filings

### PDF Generation

- **create-sample-pdf.js**: Creates sample PDF files for testing purposes

### Utility Scripts

- **create-task-branch.sh**: Shell script to create a new git branch for a task

## Running the Scripts

Most scripts can be run using npm:

```bash
# For content extraction testing
npm run test:extraction    # JS version
npm run test:extraction:ts # TS version

# For PDF parsing
npm run test:pdf

# For XBRL parsing
npm run test:xbrl

# For Tesla filings testing
npm run test:tesla
npm run test:tesla:simple

# For creating sample PDFs
npm run create-pdf
```

## Output Directories

- **pdf-parser-results/**: Contains output from PDF parsing tests
- **tesla-filing-results/**: Contains output from Tesla filing tests
- **dist/**: Contains compiled TypeScript files 