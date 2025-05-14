import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input } from "@/components/ui";

export default async function SettingsPage() {
  const user = await currentUser();
  
  if (!user) {
    redirect("/sign-in");
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>
      
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Notification Preferences</CardTitle>
            <CardDescription>Manage how you receive updates about your tracked tickers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                id="email-notifications" 
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                defaultChecked
              />
              <label htmlFor="email-notifications" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Email Notifications
              </label>
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                id="daily-digest" 
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                defaultChecked
              />
              <label htmlFor="daily-digest" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Daily Digest
              </label>
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                id="realtime-alerts" 
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                defaultChecked
              />
              <label htmlFor="realtime-alerts" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Real-time Alerts
              </label>
            </div>
            
            <Button>Save Preferences</Button>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>API Access</CardTitle>
            <CardDescription>Manage your API credentials</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="api-key" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                API Key
              </label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  type="text"
                  placeholder="No API key generated"
                  disabled
                  value="••••••••••••••••••••••"
                  className="flex-1"
                />
                <Button variant="outline">Generate New Key</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Generate an API key to access your data programmatically. Never share your API key.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 