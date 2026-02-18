import { render } from "@testing-library/react";
import BillingLoading from "../loading";

describe("BillingLoading", () => {
  test("renders skeleton elements", () => {
    const { container } = render(<BillingLoading />);
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(5);
  });

  test("wraps content in a container", () => {
    const { container } = render(<BillingLoading />);
    const wrapper = container.querySelector(".container");
    expect(wrapper).toBeInTheDocument();
  });

  test("renders a card with shadow", () => {
    const { container } = render(<BillingLoading />);
    const card = container.querySelector('[class*="shadow"]');
    expect(card).toBeInTheDocument();
  });

  test("applies fadeIn animation to wrapper", () => {
    const { container } = render(<BillingLoading />);
    const animated = container.querySelector(".animate-fadeIn");
    expect(animated).toBeInTheDocument();
  });

  test("includes a separator skeleton between content and actions", () => {
    const { container } = render(<BillingLoading />);
    // The separator is represented by a full-width skeleton line
    const separatorSkeleton = container.querySelector('[data-slot="skeleton"].h-px.w-full');
    expect(separatorSkeleton).toBeInTheDocument();
  });
});
