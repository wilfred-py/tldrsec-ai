import { render } from "@testing-library/react";
import SubscribeLoading from "../loading";

describe("SubscribeLoading", () => {
  test("renders skeleton elements", () => {
    const { container } = render(<SubscribeLoading />);
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(10);
  });

  test("includes a back button skeleton", () => {
    const { container } = render(<SubscribeLoading />);
    // Back button area: a small skeleton at the top-left
    const backBtn = container.querySelector('[data-testid="back-button-skeleton"]');
    expect(backBtn).toBeInTheDocument();
  });

  test("renders a centered header area", () => {
    const { container } = render(<SubscribeLoading />);
    const header = container.querySelector(".text-center");
    expect(header).toBeInTheDocument();
  });

  test("includes a billing toggle skeleton", () => {
    const { container } = render(<SubscribeLoading />);
    const toggle = container.querySelector('[data-testid="toggle-skeleton"]');
    expect(toggle).toBeInTheDocument();
  });

  test("renders 2 plan card skeletons matching actual plan count", () => {
    const { container } = render(<SubscribeLoading />);
    const cards = container.querySelectorAll('[data-testid="plan-card-skeleton"]');
    expect(cards).toHaveLength(2);
  });

  test("uses responsive grid for plan cards", () => {
    const { container } = render(<SubscribeLoading />);
    const grid = container.querySelector(".md\\:grid-cols-2");
    expect(grid).toBeInTheDocument();
  });

  test("applies fadeIn animation to wrapper", () => {
    const { container } = render(<SubscribeLoading />);
    const animated = container.querySelector(".animate-fadeIn");
    expect(animated).toBeInTheDocument();
  });
});
