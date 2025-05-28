import { Navigation } from "@/components/navigation";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navigation />
      {children}
    </>
  );
} 