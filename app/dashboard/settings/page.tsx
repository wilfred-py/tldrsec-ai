import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/dashboard";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CreditCardIcon } from "lucide-react";

export default async function SettingsPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <div className="space-y-8">
      <DashboardHeader heading="Settings" description="Manage your account settings and preferences." />

      {/* Profile Settings */}
      <div className="rounded-lg border">
        <div className="p-6">
          <h2 className="text-lg font-semibold">Profile Settings</h2>
          <p className="text-sm text-muted-foreground">Manage your account information.</p>

          <div className="mt-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value="John Doe" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value="john@example.com" disabled />
              <p className="text-xs text-muted-foreground mt-1">Email cannot be changed. Contact support for assistance.</p>
            </div>

            <Button>Save Changes</Button>
          </div>
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="rounded-lg border">
        <div className="p-6">
          <h2 className="text-lg font-semibold">Notification Preferences</h2>
          <p className="text-sm text-muted-foreground">Configure how you receive notifications.</p>

          <div className="mt-6 space-y-6">
            <div>
              <Label className="mb-3 block">Notification Type</Label>
              <RadioGroup defaultValue="immediate">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="immediate" id="immediate" />
                  <Label htmlFor="immediate">Immediate</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="daily" id="daily" />
                  <Label htmlFor="daily">Daily Digest</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="none" id="none" />
                  <Label htmlFor="none">None</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-4">
              <Label className="mb-2 block">Filing Types</Label>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="10k-10q" className="cursor-pointer">10-K and 10-Q Reports</Label>
                <Switch id="10k-10q" defaultChecked />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="8k" className="cursor-pointer">8-K Reports</Label>
                <Switch id="8k" defaultChecked />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="form4" className="cursor-pointer">Form 4 (Insider Trading)</Label>
                <Switch id="form4" defaultChecked />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="other" className="cursor-pointer">Other Filings</Label>
                <Switch id="other" />
              </div>
            </div>

            <Button>Save Preferences</Button>
          </div>
        </div>
      </div>

      {/* Subscription */}
      <div className="rounded-lg border">
        <div className="p-6">
          <h2 className="text-lg font-semibold">Subscription</h2>
          <p className="text-sm text-muted-foreground">Manage your subscription plan.</p>

          <div className="mt-6 space-y-6">
            <div className="rounded-lg border border-yellow-100 bg-yellow-50 p-4">
              <div className="flex justify-between">
                <div>
                  <h3 className="font-semibold">Pro Plan</h3>
                  <p className="text-sm">$9.99/month</p>
                </div>
                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 border-amber-200">
                  Active
                </span>
              </div>
              
              <ul className="mt-4 space-y-2">
                <li className="flex items-center text-sm">
                  <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4 text-green-600" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Track unlimited tickers
                </li>
                <li className="flex items-center text-sm">
                  <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4 text-green-600" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Immediate notifications
                </li>
                <li className="flex items-center text-sm">
                  <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4 text-green-600" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Advanced dashboard with analytics
                </li>
                <li className="flex items-center text-sm">
                  <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4 text-green-600" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Unlimited summary history
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-2">Billing Information</h3>
              <div className="flex items-center gap-3 rounded-md border p-3">
                <CreditCardIcon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Visa ending in 4242</p>
                  <p className="text-xs text-muted-foreground">Expires 12/26</p>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Your next billing date is June 15, 2025.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="outline">Update Payment</Button>
              <Button variant="outline" className="text-red-500 hover:text-red-600">
                Cancel Subscription
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="rounded-lg border">
        <div className="p-6">
          <h2 className="text-lg font-semibold">Security</h2>
          <p className="text-sm text-muted-foreground">Manage your account security.</p>

          <div className="mt-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input id="current-password" type="password" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input id="new-password" type="password" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input id="confirm-password" type="password" />
            </div>

            <Button>Update Password</Button>
          </div>
        </div>
      </div>
    </div>
  );
} 