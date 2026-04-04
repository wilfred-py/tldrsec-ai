import React from 'react';

/**
 * Jest mock for @number-flow/react
 * Renders predictable formatted text for test assertions.
 */
export default function NumberFlow({
  value,
  format,
  locales,
  className,
  style,
  ...props
}: {
  value: number;
  format?: Intl.NumberFormatOptions;
  locales?: string | string[];
  className?: string;
  style?: React.CSSProperties;
  [key: string]: unknown;
}) {
  const formatted = new Intl.NumberFormat(locales || 'en-US', format).format(value);
  return (
    <span className={className} style={style} data-testid="number-flow" {...props}>
      {formatted}
    </span>
  );
}
