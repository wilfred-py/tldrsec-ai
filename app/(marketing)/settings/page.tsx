import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input } from "@/components/ui";
import SettingsForm from "@/components/settings/SettingsForm";
import SubscriptionManager from "@/components/settings/SubscriptionManager";

export default async function SettingsPage() {
  const user = await currentUser();
  
  if (!user) {
    redirect("/sign-in");
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>
      
      <div className="grid gap-6">
        {/* Notification Preferences */}
        <SettingsForm userId={user.id} />
        
        {/* Ticker Subscriptions */}
        <Card>
          <CardHeader>
            <CardTitle>Ticker Subscriptions</CardTitle>
            <CardDescription>Manage the companies you track for SEC filings</CardDescription>
          </CardHeader>
          <CardContent>
            <SubscriptionManager userId={user.id} />
          </CardContent>
        </Card>
        
        {/* API Access */}
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