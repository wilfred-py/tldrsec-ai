import { Navigation } from "@/components/navigation";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navigation />
      <div className="min-h-screen">
        {children}
      </div>
    </>
  );
} 