/**
 * TypeScript interfaces for digit-rolling counter animation components
 */

export interface CounterDisplayProps {
  /** The count value to display */
  count: number;
  /** Whether animations are currently running */
  isAnimating?: boolean;
  /** Callback fired when all digit animations complete */
  onAnimationComplete?: () => void;
  /** Additional CSS class names */
  className?: string;
  /** Test ID for Playwright testing */
  'data-testid'?: string;
}

export interface DigitRollerProps {
  /** Single digit value (0-9) to display */
  value: number;
  /** Animation duration in milliseconds */
  animationDuration?: number;
  /** Stagger delay before animation starts (ms) */
  delay?: number;
  /** Callback when this digit's animation completes */
  onAnimationComplete?: () => void;
  /** Additional CSS class names */
  className?: string;
}

export interface DigitColumnProps {
  /** Current digit to display (0-9) */
  digit: number;
  /** Previous digit value (for transition direction) */
  previousDigit?: number;
  /** Whether this digit is currently animating */
  isAnimating: boolean;
}

export interface AnimationState {
  /** Whether any animation is currently running */
  isAnimating: boolean;
  /** Timestamp when current animation started */
  startTime: number;
  /** Queue of pending count values */
  queue: number[];
}

export interface DigitSeparationResult {
  /** Array of individual digit values */
  digits: number[];
  /** Whether digits changed from previous value */
  hasChanged: boolean;
  /** Indices of digits that changed */
  changedIndices: number[];
}
