'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { User } from "@clerk/nextjs/server";
import { toast } from "sonner";
import { Loader2, Download, Trash2 } from "lucide-react";

interface UserProfileSectionProps {
  user: User;
  subscriptionTier?: string;
  tickerCount?: number;
}

export default function UserProfileSection({ user, subscriptionTier = 'FREE', tickerCount = 0 }: UserProfileSectionProps) {
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState('light');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/user/export');
      if (!response.ok) throw new Error('Export failed');
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tldrsec-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Data exported successfully');
    } catch {
      toast.error('Failed to export data. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch('/api/user/account', { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || 'Deletion failed');
      }
      toast.success('Account scheduled for deletion. You have 30 days to change your mind.');
      window.location.href = '/';
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete account. Please contact support.');
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

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

      const data = await response.json() as { success?: boolean };

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
              <Button variant="outline" size="sm" onClick={handleExportData} disabled={isExporting}>
                {isExporting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Exporting...</>
                ) : (
                  <><Download className="h-4 w-4 mr-2" />Export Account Data</>
                )}
              </Button>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Delete Account</h3>
              <p className="text-xs text-muted-foreground">
                Schedule your account for deletion. You have 30 days to change your mind.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="text-red-500 hover:text-red-600"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Account
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Information — dynamic */}
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>Manage your subscription and billing information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <div className="flex justify-between">
              <div>
                <h3 className="font-semibold capitalize">{subscriptionTier.toLowerCase()}</h3>
                <p className="text-sm">
                  {subscriptionTier === 'FREE' ? '$0/month' : subscriptionTier === 'PRO' ? '$29/month' : '$199/month'}
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-800 border-blue-200">
                Active
              </span>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              Tracking {tickerCount} {tickerCount === 1 ? 'company' : 'companies'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {subscriptionTier === 'FREE' || subscriptionTier === 'PRO' ? (
              <Button onClick={() => window.location.href = '/subscribe'}>
                {subscriptionTier === 'FREE' ? 'Upgrade to Pro' : 'Upgrade to Max'}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => window.location.href = '/dashboard/billing'}>
              Manage Billing
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Delete Account</DialogTitle>
            <DialogDescription>
              This will schedule your account for deletion. Your subscription will be cancelled immediately.
              You have <strong>30 days</strong> to change your mind by contacting support.
              After 30 days, all data will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDeleteAccount}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</>
              ) : (
                'Delete My Account'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}