import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await currentUser();
  
  if (!user) {
    redirect("/sign-in");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Track companies and get summaries of their SEC filings delivered to your inbox.
        </p>
      </div>
      
      {/* Ticker tracking section */}
      <div className="border rounded-lg p-4 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Tracked Companies</h2>
          <Button size="sm">Add Company</Button>
        </div>
        
        {/* Placeholder for ticker table */}
        <div className="rounded-md border min-h-[200px] flex items-center justify-center bg-muted/30">
          <div className="text-center p-4">
            <h3 className="font-medium mb-2">No companies tracked yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Start tracking companies to receive SEC filing summaries.
            </p>
            <Button size="sm">Add Your First Company</Button>
          </div>
        </div>
      </div>
      
      {/* Recent Summaries section */}
      <div className="border rounded-lg p-4 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Summaries</h2>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/summaries">View All</Link>
          </Button>
        </div>
        
        {/* Placeholder for summaries */}
        <div className="rounded-md border min-h-[200px] flex items-center justify-center bg-muted/30">
          <div className="text-center p-4">
            <h3 className="font-medium mb-2">No summaries yet</h3>
            <p className="text-muted-foreground text-sm">
              Summaries will appear here once you start tracking companies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 