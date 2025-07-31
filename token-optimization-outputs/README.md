# Token Optimization Testing Structure

This directory contains structured outputs for SEC filing token optimization testing, organized by optimization level, form type, and ticker symbol.

## Directory Structure

```
token-optimization-outputs/
├── conservative/          # Conservative optimization (70-80% reduction)
│   ├── 10-k/             # Annual reports
│   │   ├── tsla/         # Tesla filings
│   │   ├── aapl/         # Apple filings
│   │   ├── msft/         # Microsoft filings
│   │   ├── googl/        # Google filings
│   │   └── amzn/         # Amazon filings
│   ├── 10-q/             # Quarterly reports
│   ├── 8-k/              # Current reports
│   └── form-4/           # Insider trading reports
├── balanced/              # Balanced optimization (80-90% reduction)
│   └── [same structure as conservative]
├── aggressive/            # Aggressive optimization (90%+ reduction)
│   └── [same structure as conservative]
└── meta/                  # Documentation and metadata
    ├── methodology/       # Implementation files and analysis
    ├── results/          # Test results and comparisons
    └── demos/            # Demo scripts and examples
```

## Optimization Levels

### Conservative (70-80% reduction)
- Preserves more context and formatting
- Safer for complex filings with intricate relationships
- Better for filings requiring detailed analysis

### Balanced (80-90% reduction)
- Optimal balance between compression and accuracy
- Recommended for most production use cases
- Maintains all critical information with good context

### Aggressive (90%+ reduction)
- Maximum token reduction for cost optimization
- Focuses only on essential shareholder information
- Best for high-volume processing where cost is critical

## Form Types

- **10-K**: Annual comprehensive reports
- **10-Q**: Quarterly financial reports  
- **8-K**: Material event reports
- **Form 4**: Insider trading disclosures

## Usage

Each subdirectory will contain optimized filing outputs for quality review and accuracy testing. Files will be named with the pattern:
`{ticker}_{form_type}_{date}_{optimization_level}.txt`

Example: `tsla_10q_2025q2_aggressive.txt`

## Quality Review Focus

When reviewing outputs in each directory, assess:
1. **Financial Accuracy**: All numbers preserved correctly
2. **Material Completeness**: Critical information retained
3. **Context Preservation**: Sufficient context for AI analysis
4. **Optimization Effectiveness**: Token reduction vs. information loss trade-off