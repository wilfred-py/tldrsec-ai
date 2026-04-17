import React from 'react';
import { render, act } from '@testing-library/react';
import { useAnimatedMinutes, MINUTES_SAVED_STORAGE_KEY } from '@/components/dashboard/dashboard-client';

// Render a tiny harness so we can exercise the hook in a component tree.
function Harness({ target }: { target: number }) {
  const { displayed, isAnimating } = useAnimatedMinutes(target);
  return (
    <div>
      <span data-testid="displayed">{displayed}</span>
      <span data-testid="animating">{String(isAnimating)}</span>
    </div>
  );
}

describe('useAnimatedMinutes', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    localStorage.clear();
  });

  it('first visit: animates from 0 to target when localStorage is empty', () => {
    const { getByTestId } = render(<Harness target={100} />);

    // After first step (500ms), displayed should be between 0 and 100 (not yet at target).
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const early = Number(getByTestId('displayed').textContent);
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(100);
    expect(getByTestId('animating').textContent).toBe('true');

    // Drive all steps to completion.
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(getByTestId('displayed').textContent).toBe('100');
    expect(getByTestId('animating').textContent).toBe('false');
    // Final value persisted.
    expect(localStorage.getItem(MINUTES_SAVED_STORAGE_KEY)).toBe('100');
  });

  it('return visit: animates only the delta from stored value to target', () => {
    localStorage.setItem(MINUTES_SAVED_STORAGE_KEY, '90');

    const { getByTestId } = render(<Harness target={100} />);

    // Run one step.
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const early = Number(getByTestId('displayed').textContent);
    // Start is 90, target is 100, so early value should be at least 90.
    expect(early).toBeGreaterThanOrEqual(90);
    expect(early).toBeLessThanOrEqual(100);

    // Complete the animation.
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(getByTestId('displayed').textContent).toBe('100');
    expect(localStorage.getItem(MINUTES_SAVED_STORAGE_KEY)).toBe('100');
  });

  it('skips animation when target is 0', () => {
    const { getByTestId } = render(<Harness target={0} />);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(getByTestId('displayed').textContent).toBe('0');
    expect(getByTestId('animating').textContent).toBe('false');
    // No localStorage write when target is 0 (nothing to persist).
    expect(localStorage.getItem(MINUTES_SAVED_STORAGE_KEY)).toBeNull();
  });

  it('no-op when stored value already equals target', () => {
    localStorage.setItem(MINUTES_SAVED_STORAGE_KEY, '50');

    const { getByTestId } = render(<Harness target={50} />);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(getByTestId('displayed').textContent).toBe('50');
    expect(getByTestId('animating').textContent).toBe('false');
  });

  it('clears timeout on unmount (no orphan timers)', () => {
    const clearSpy = jest.spyOn(global, 'clearTimeout');

    const { unmount } = render(<Harness target={500} />);

    // Let the animation start.
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Unmount mid-animation.
    unmount();

    // clearTimeout should have been called in the effect cleanup.
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('tolerates corrupt localStorage value (falls back to 0 start)', () => {
    localStorage.setItem(MINUTES_SAVED_STORAGE_KEY, 'not-a-number');

    const { getByTestId } = render(<Harness target={100} />);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(getByTestId('displayed').textContent).toBe('100');
  });
});
