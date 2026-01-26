import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

interface DashboardPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const params = await searchParams;
  const showWelcome = params.welcome === 'true';
  const shouldMergePending = params.merge === 'pending' || showWelcome;
  const subscriptionSuccess = params.subscription_success === 'true';

  return <DashboardClient showWelcome={showWelcome} shouldMergePending={shouldMergePending} subscriptionSuccess={subscriptionSuccess} />;
}