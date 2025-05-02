import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SummariesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Summaries</h1>
        <p className="text-muted-foreground mt-2">
          View and manage your SEC filing summaries
        </p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Company</label>
            <select className="w-full px-3 py-2 border rounded-md">
              <option value="all">All Companies</option>
              <option value="placeholder">No companies yet</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Filing Type</label>
            <select className="w-full px-3 py-2 border rounded-md">
              <option value="all">All Types</option>
              <option value="10-K">10-K</option>
              <option value="10-Q">10-Q</option>
              <option value="8-K">8-K</option>
              <option value="form4">Form 4</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Date Range</label>
            <select className="w-full px-3 py-2 border rounded-md">
              <option value="all">All Time</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Summaries List - Empty State */}
      <div className="rounded-md border min-h-[400px] flex items-center justify-center bg-muted/30">
        <div className="text-center p-4">
          <h3 className="font-medium mb-2">No summaries available</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Start tracking companies to receive SEC filing summaries.
          </p>
          <Button size="sm">Track Companies</Button>
        </div>
      </div>
    </div>
  );
} 