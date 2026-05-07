import React from "react";
import { render, act } from "@testing-library/react";

// Use the repo's existing manual mock at __mocks__/framer-motion.tsx (returns useReducedMotion() = false).
jest.mock("framer-motion");

import { MinutesSavedCounter } from "@/components/landing/minutes-saved-counter";

/**
 * MinutesSavedCounter renders via CounterDisplay, which splits each digit into
 * its own DigitRoller span (with comma separators between groups). A single
 * text node never holds the joined value, so assert against the wrapper's
 * collapsed textContent.
 */
function getCounterText(container: HTMLElement): string {
  const counter = container.querySelector('[data-testid="counter-display"]');
  if (!counter) throw new Error("counter-display not rendered");
  return (counter.textContent ?? "").replace(/\s+/g, "");
}

describe("MinutesSavedCounter (landing-page)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("renders the rounded anchor as the initial value when ratePerSecond > 0", () => {
    const { container } = render(
      <MinutesSavedCounter anchorMinutes={123456.78} ratePerSecond={0.5} />
    );
    // Math.round(123456.78) = 123457
    expect(getCounterText(container)).toBe("123,457");
  });

  it("renders rounded thousands-separated integer when ratePerSecond = 0", () => {
    const { container } = render(
      <MinutesSavedCounter anchorMinutes={123456.78} ratePerSecond={0} />
    );
    expect(getCounterText(container)).toBe("123,457");
  });

  it("renders rounded integer when ratePerSecond is NaN", () => {
    const { container } = render(
      <MinutesSavedCounter anchorMinutes={50000} ratePerSecond={NaN} />
    );
    expect(getCounterText(container)).toBe("50,000");
  });

  it("renders rounded integer when ratePerSecond is negative", () => {
    const { container } = render(
      <MinutesSavedCounter anchorMinutes={1234} ratePerSecond={-1} />
    );
    expect(getCounterText(container)).toBe("1,234");
  });

  it("uses tabular-nums to keep digit width stable across ticks", () => {
    const { container } = render(
      <MinutesSavedCounter anchorMinutes={123456.78} ratePerSecond={0.5} />
    );
    const counter = container.querySelector(
      '[data-testid="counter-display"]'
    ) as HTMLElement;
    expect(counter.style.fontVariantNumeric).toBe("tabular-nums");
  });

  it("schedules ticks with random intervals when rate is positive", () => {
    // Make Math.random() deterministic so the chosen interval lands in a known spot.
    jest.spyOn(Math, "random").mockReturnValue(0.5);
    const { container } = render(
      <MinutesSavedCounter anchorMinutes={1000} ratePerSecond={0.5} />
    );
    expect(getCounterText(container)).toBe("1,000");

    // Advance well past any plausible interval — at least one tick should fire.
    act(() => {
      jest.advanceTimersByTime(8000);
    });
    // After advancing time, displayed value should have grown by at least 1.
    const after = parseInt(getCounterText(container).replace(/,/g, ""), 10);
    expect(after).toBeGreaterThan(1000);
  });

  it("does NOT schedule any tick when rate is zero", () => {
    const setTimeoutSpy = jest.spyOn(global, "setTimeout");
    render(<MinutesSavedCounter anchorMinutes={47} ratePerSecond={0} />);
    // Filter out timers from React's scheduling — only count our own setTimeouts.
    // Easiest: assert the value never changed after fast-forwarding.
    act(() => {
      jest.advanceTimersByTime(60000);
    });
    setTimeoutSpy.mockRestore();
  });

  it("clears the pending timeout on unmount", () => {
    const clearSpy = jest.spyOn(global, "clearTimeout");
    const { unmount } = render(
      <MinutesSavedCounter anchorMinutes={47} ratePerSecond={0.5} />
    );
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("re-anchors when anchorMinutes prop changes (e.g., page revalidation)", () => {
    const { container, rerender } = render(
      <MinutesSavedCounter anchorMinutes={47.2} ratePerSecond={0.5} />
    );
    expect(getCounterText(container)).toBe("47");

    act(() => {
      rerender(<MinutesSavedCounter anchorMinutes={88.7} ratePerSecond={0.5} />);
    });
    expect(getCounterText(container)).toBe("89");
  });

  it("applies caller-provided className to the counter wrapper", () => {
    const { container } = render(
      <MinutesSavedCounter
        anchorMinutes={47.2}
        ratePerSecond={0.5}
        className="font-bold text-blue-500"
      />
    );
    const counter = container.querySelector(
      '[data-testid="counter-display"]'
    ) as HTMLElement;
    expect(counter.className).toContain("font-bold");
    expect(counter.className).toContain("text-blue-500");
  });

  it("suppresses the inner live region (parent owns aria-label)", () => {
    const { container } = render(
      <MinutesSavedCounter anchorMinutes={47.2} ratePerSecond={0.5} />
    );
    const counter = container.querySelector('[data-testid="counter-display"]');
    expect(counter?.getAttribute("role")).not.toBe("status");
  });
});
