import { Sidebar } from "@/components/layout/sidebar";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1">
        <Sidebar className="fixed inset-y-0 z-30 w-64 border-r" />
        <main className="flex-1 md:pl-64">
          <div className="container py-8 md:py-10 px-6 md:px-8 space-y-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
} 