# DESIGN.md — tldrSEC Email Design System

This document is the single source of truth for all email template design decisions.
Templates MUST reference these tokens. New components MUST align with this system.

## Design Philosophy

**Morning Brew-inspired minimalism.** Users scan emails in 2-5 seconds.
Every pixel must earn its place. Signal > decoration.

### Core Principles
1. **Signal-first**: The verdict (does this matter?) is the HERO section
2. **Scannable**: 2-second glance tells you if action is needed
3. **Minimal color**: Only green/red for changes. Purple for CTAs only.
4. **Tight spacing**: 7px between lines (Morning Brew standard)
5. **Trust at pixel level**: Never show confidently wrong information

## Color Tokens

```
EmailColors.text.headline    = #000000   Pure black for headings
EmailColors.text.body        = #374151   Gray 700 for body text
EmailColors.text.meta        = #6B7280   Gray 500 for labels/metadata
EmailColors.text.muted       = #9CA3AF   Gray 400 for less important text

EmailColors.structure.border       = #e6e6e6   Light gray borders
EmailColors.structure.borderLight  = #f1f5f9   Very light gray dividers
EmailColors.structure.background   = #ffffff   White content areas
EmailColors.structure.backgroundAlt = #f8fafc  Slight gray for alternating

EmailColors.semantic.positive = #10B981   Green 500 for buys/gains
EmailColors.semantic.negative = #EF4444   Red 500 for sells/losses
EmailColors.semantic.neutral  = #6B7280   Gray 500 for no change
EmailColors.semantic.accent   = #7C3AED   Purple for CTAs only (minimal use)
```

## Typography Scale

```
headline:     16px / 600 / #000000 / line-height 1.3
subheadline:  14px / 600 / #000000
body:         14px / 400 / #374151 / line-height 1.6
meta:         12px / 500 / #6B7280
label:        11px / 600 / #6B7280 / uppercase / 0.5px letter-spacing
number:       14px / 600 / Monaco, Consolas, monospace
numberLarge:  18px / 700 / Monaco, Consolas, monospace
```

Font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`

## Spacing System

```
Section padding:  15px horizontal (Morning Brew standard)
Section margin:   20px vertical
Tight spacing:    7px (Morning Brew standard between lines)
Cell padding:     10px 12px
Large padding:    20px
```

## Component Inventory

### EmailHeader
- tldrSEC logo (18px bold) + date (12px meta, right-aligned)
- Filing type badge (11px uppercase, gray background pill)
- Headline: `{TICKER}: {Filer Name}, {Role}` (22px bold + 16px role)
- Company name subtitle (14px meta)
- Filer roles truncated at 30 chars with ellipsis

### Signal Badge (Form 4)
Three levels with distinct visual treatment:
- **LOW** (gray): `#94A3B8` border, `#F1F5F9` bg, `#475569` text
- **MODERATE** (amber): Amber border/bg/text
- **HIGH** (red/green): Red for sells, green for buys

### Transaction Cards (Form 4)
Color-coded by type:
- **Sale**: Red bg (`#FEF2F2`), red text/value
- **Purchase**: Green bg, green text/value
- **Award/Grant**: Blue bg, blue text/value
- **Gift/Transfer**: Gray bg, gray text/value

Layout: Side-by-side on desktop (percentage widths), stacked on mobile.
Max 3 transaction types shown.

### Stake Impact Section
Adaptive display:
- **Full**: Previous stake → arrow → New stake (% change)
- **Current only**: "Current Holdings: X shares"
- **Hidden**: When no stake data available

### EmailFooter
- CTA button: Purple (#7C3AED), 16px/24px padding (48px touch target)
- Footer text: "tldrSEC | AI-Powered SEC Filing Summaries"

### StalenessBanner
Red banner for delayed filings (>7 days old).

### Preheader
Hidden text for inbox preview: `"{SIGNAL LEVEL} SIGNAL: {Verdict} — {first sentence}"`

## Data Quality States

Every template must handle all data quality levels:

```
QUALITY         | HEADER        | NUMBERS        | STAKE
────────────────┼───────────────┼────────────────┼──────────────
full            | Filer + role  | AI data        | Full bar
partial         | Filer only    | AI data        | Current only
extractor-only  | From regex    | (estimated)    | From text
degraded        | Company name  | Hidden         | Hidden
```

## Anti-Patterns (DO NOT)

- Never show "$0 Sold" for gifts — use shares as hero number
- Never show "Insider" when filer name is available
- Never use raw SEC name format (LAST FIRST) — normalize to First Last
- Never omit the signal badge — it's the most important element
- Never use colors beyond the semantic palette
- Never exceed 600px max-width

## Source Files

| Component | Path |
|---|---|
| Design tokens | `components/ui/email/design-system.ts` |
| Form 4 template | `components/ui/email/templates/form4-minimalist-template.tsx` |
| Header | `components/ui/email/templates/sections/EmailHeader.tsx` |
| Footer | `components/ui/email/templates/sections/EmailFooter.tsx` |
| Field normalizer | `lib/email/form4-field-normalizer.ts` |
| Data extractor | `lib/email/form4-data-extractor.ts` |
