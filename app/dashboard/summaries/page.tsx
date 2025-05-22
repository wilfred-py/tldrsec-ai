import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { 
  DashboardHeader, 
  EmptyPlaceholder 
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchIcon } from "lucide-react";

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
      
      {/* Search and filter controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search summaries..."
            className="pl-8 w-full md:max-w-sm"
          />
        </div>
        
        <div className="flex gap-2">
          <Select defaultValue="newest">
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="company-asc">Company (A-Z)</SelectItem>
              <SelectItem value="company-desc">Company (Z-A)</SelectItem>
            </SelectContent>
          </Select>
          
          <Button variant="outline" size="icon" className="h-10 w-10">
            <span className="sr-only">Refresh</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-refresh-cw">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
          </Button>
        </div>
      </div>
      
      {/* Tabs for different filing types */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="10k">10-K</TabsTrigger>
          <TabsTrigger value="10q">10-Q</TabsTrigger>
          <TabsTrigger value="8k">8-K</TabsTrigger>
          <TabsTrigger value="other">Other</TabsTrigger>
        </TabsList>
        
        <TabsContent value="all">
          <EmptyPlaceholder
            title="No summaries yet"
            description="Summaries will appear here once you start tracking companies."
            actions={<Button>Add Company</Button>}
          />
        </TabsContent>
        
        <TabsContent value="10k">
          <EmptyPlaceholder
            title="No 10-K summaries"
            description="Annual reports will appear here once available."
          />
        </TabsContent>
        
        <TabsContent value="10q">
          <EmptyPlaceholder
            title="No 10-Q summaries"
            description="Quarterly reports will appear here once available."
          />
        </TabsContent>
        
        <TabsContent value="8k">
          <EmptyPlaceholder
            title="No 8-K summaries"
            description="Current reports will appear here once available."
          />
        </TabsContent>
        
        <TabsContent value="other">
          <EmptyPlaceholder
            title="No other summaries"
            description="Other filing types will appear here once available."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
} 