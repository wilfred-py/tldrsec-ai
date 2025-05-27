import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { 
  DashboardHeader, 
  EmptyPlaceholder 
} from "@/components/dashboard";
import { SummariesClient } from "@/components/dashboard/summaries-client";

export default async function SummariesPage() {
  const user = await currentUser();
  
  if (!user) {
    redirect("/sign-in");
  }

  return (
    <div className="space-y-6">
      <DashboardHeader
        heading="Summaries"
        description="Browse and search through all your SEC filing summaries."
      />
      
      <SummariesClient />
    </div>
  );
} 