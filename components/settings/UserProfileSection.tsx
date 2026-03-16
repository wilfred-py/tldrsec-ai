'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { User } from "@clerk/nextjs/server";
import { toast } from "sonner";

interface UserProfileSectionProps {
  user: User;
}

export default function UserProfileSection({ user }: UserProfileSectionProps) {
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState('light');

  const handleThemeChange = async (newTheme: string) => {
    try {
      setLoading(true);
      setTheme(newTheme);
      
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferences: {
            theme: newTheme,
          },
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Theme updated successfully');
        // Apply theme to document
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
      } else {
        toast.error('Failed to update theme');
        // Revert on error
        setTheme(theme);
      }
    } catch (error) {
      console.error('Error updating theme:', error);
      toast.error('Failed to update theme');
      setTheme(theme);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Your account information managed by your authentication provider.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input 
                id="name" 
                value={user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName || 'Not provided'} 
                disabled 
              />
              <p className="text-xs text-muted-foreground">Managed by your authentication provider</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                value={user.emailAddresses[0]?.emailAddress || 'Not provided'} 
                disabled 
              />
              <p className="text-xs text-muted-foreground">Managed by your authentication provider</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-since">Member Since</Label>
            <Input 
              id="member-since" 
              value={user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'} 
              disabled 
            />
          </div>
        </CardContent>
      </Card>

      {/* Theme Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize how the application looks and feels.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Theme</Label>
            <RadioGroup
              value={theme}
              onValueChange={handleThemeChange}
              disabled={loading}
              className="flex flex-col space-y-1"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="light" id="light" />
                <Label htmlFor="light">Light - Clean and bright interface</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="dark" id="dark" />
                <Label htmlFor="dark">Dark - Easy on the eyes for extended use</Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      {/* Account Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Account Actions</CardTitle>
          <CardDescription>Manage your account and data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Export Data</h3>
              <p className="text-xs text-muted-foreground">
                Download all your account data including preferences and tracked companies.
              </p>
              <Button variant="outline" size="sm">
                Export Account Data
              </Button>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Delete Account</h3>
              <p className="text-xs text-muted-foreground">
                Permanently delete your account and all associated data.
              </p>
              <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600">
                Delete Account
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Information */}
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>Manage your subscription and billing information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <div className="flex justify-between">
              <div>
                <h3 className="font-semibold">Trial</h3>
                <p className="text-sm">$0/month</p>
              </div>
              <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-800 border-blue-200">
                Active
              </span>
            </div>
            
            <ul className="mt-4 space-y-2">
              <li className="flex items-center text-sm">
                <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4 text-green-600" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Track up to 5 companies
              </li>
              <li className="flex items-center text-sm">
                <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4 text-green-600" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Daily digest notifications
              </li>
              <li className="flex items-center text-sm">
                <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4 text-green-600" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Basic filing summaries
              </li>
            </ul>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button>Upgrade to Pro</Button>
            <Button variant="outline">View Plans</Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}