import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account preferences and notification settings.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>
              Update your personal information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Your name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="Your email" disabled />
              <p className="text-sm text-muted-foreground">
                To change your email, update it in your Clerk account settings.
              </p>
            </div>
            <Button>Save Changes</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notification Preferences</CardTitle>
            <CardDescription>
              Customize how you receive filing notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Notification Frequency</Label>
              <div className="flex flex-col space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="immediate"
                    name="notification-type"
                    className="h-4 w-4"
                    defaultChecked
                  />
                  <Label htmlFor="immediate" className="cursor-pointer">Immediate</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="digest"
                    name="notification-type"
                    className="h-4 w-4"
                  />
                  <Label htmlFor="digest" className="cursor-pointer">Daily Digest</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="none"
                    name="notification-type"
                    className="h-4 w-4"
                  />
                  <Label htmlFor="none" className="cursor-pointer">None</Label>
                </div>
              </div>
            </div>
            <Button>Save Preferences</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 