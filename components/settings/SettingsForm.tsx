'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from "@/components/ui";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { NotificationPreference } from '@/lib/email/notification-service';
import { UserPreferences, FilingTypePreferences, NotificationContentPreferences } from '@/lib/user/preference-types';
import { toast } from 'sonner';

interface SettingsFormProps {
  userId: string;
}

export default function SettingsForm({ userId }: SettingsFormProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  
  // Fetch user preferences on mount
  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/user/preferences');
        const data = await response.json();
        
        if (data.success && data.preferences) {
          setPreferences(data.preferences);
        } else {
          toast.error('Failed to load preferences');
        }
      } catch (error) {
        console.error('Error fetching preferences:', error);
        toast.error('Failed to load preferences');
      } finally {
        setLoading(false);
      }
    };
    
    fetchPreferences();
  }, []);
  
  // Handle preference updates
  const handleEmailFrequencyChange = (value: string) => {
    if (!preferences) return;
    
    setPreferences({
      ...preferences,
      notifications: {
        ...preferences.notifications,
        emailFrequency: value as NotificationPreference,
      }
    });
  };
  
  const handleFilingTypeChange = (key: keyof FilingTypePreferences, checked: boolean) => {
    if (!preferences) return;
    
    setPreferences({
      ...preferences,
      notifications: {
        ...preferences.notifications,
        filingTypes: {
          ...preferences.notifications.filingTypes,
          [key]: checked,
        }
      }
    });
  };
  
  const handleContentPreferenceChange = (key: keyof NotificationContentPreferences, checked: boolean) => {
    if (!preferences) return;
    
    setPreferences({
      ...preferences,
      notifications: {
        ...preferences.notifications,
        contentPreferences: {
          ...preferences.notifications.contentPreferences,
          [key]: checked,
        }
      }
    });
  };
  
  const handleThemeChange = (value: string) => {
    if (!preferences) return;
    
    setPreferences({
      ...preferences,
      ui: {
        ...preferences.ui,
        theme: value as 'light' | 'dark' | 'system',
      }
    });
  };
  
  const handleDashboardLayoutChange = (value: string) => {
    if (!preferences) return;
    
    setPreferences({
      ...preferences,
      ui: {
        ...preferences.ui,
        dashboardLayout: value as 'compact' | 'detailed',
      }
    });
  };
  
  const savePreferences = async () => {
    if (!preferences) return;
    
    try {
      setSaving(true);
      const response = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preferences),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('Preferences saved successfully');
      } else {
        toast.error('Failed to save preferences');
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>Loading your preferences...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (!preferences) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>Error loading preferences</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>Manage how you receive updates about SEC filings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email Frequency */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Email Notification Frequency</h3>
          <RadioGroup
            value={preferences.notifications.emailFrequency}
            onValueChange={handleEmailFrequencyChange}
            className="flex flex-col space-y-1"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value={NotificationPreference.IMMEDIATE} id="immediate" />
              <Label htmlFor="immediate">Immediate - Receive notifications as soon as filings are processed</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value={NotificationPreference.DAILY} id="daily" />
              <Label htmlFor="daily">Daily Digest - Receive a summary of filings once per day</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value={NotificationPreference.NONE} id="none" />
              <Label htmlFor="none">None - Don't send email notifications</Label>
            </div>
          </RadioGroup>
        </div>
        
        {/* Filing Types */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Filing Types to Receive</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="form10K">Annual Reports (10-K)</Label>
              <Switch
                id="form10K"
                checked={preferences.notifications.filingTypes.form10K}
                onCheckedChange={(checked: boolean) => handleFilingTypeChange('form10K', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="form10Q">Quarterly Reports (10-Q)</Label>
              <Switch
                id="form10Q"
                checked={preferences.notifications.filingTypes.form10Q}
                onCheckedChange={(checked: boolean) => handleFilingTypeChange('form10Q', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="form8K">Material Events (8-K)</Label>
              <Switch
                id="form8K"
                checked={preferences.notifications.filingTypes.form8K}
                onCheckedChange={(checked: boolean) => handleFilingTypeChange('form8K', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="form4">Insider Trading (Form 4)</Label>
              <Switch
                id="form4"
                checked={preferences.notifications.filingTypes.form4}
                onCheckedChange={(checked: boolean) => handleFilingTypeChange('form4', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="otherFilings">Other Filings</Label>
              <Switch
                id="otherFilings"
                checked={preferences.notifications.filingTypes.otherFilings}
                onCheckedChange={(checked: boolean) => handleFilingTypeChange('otherFilings', checked)}
              />
            </div>
          </div>
        </div>
        
        {/* Content Preferences */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Email Content Preferences</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="includeSummary">Include Summary Text</Label>
              <Switch
                id="includeSummary"
                checked={preferences.notifications.contentPreferences.includeSummary}
                onCheckedChange={(checked: boolean) => handleContentPreferenceChange('includeSummary', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="includeFilingDetails">Include Filing Details</Label>
              <Switch
                id="includeFilingDetails"
                checked={preferences.notifications.contentPreferences.includeFilingDetails}
                onCheckedChange={(checked: boolean) => handleContentPreferenceChange('includeFilingDetails', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="includeAnalysis">Include AI Analysis</Label>
              <Switch
                id="includeAnalysis"
                checked={preferences.notifications.contentPreferences.includeAnalysis}
                onCheckedChange={(checked: boolean) => handleContentPreferenceChange('includeAnalysis', checked)}
              />
            </div>
          </div>
        </div>
        
        {/* Save Button */}
        <Button 
          onClick={savePreferences} 
          disabled={saving}
          className="w-full"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </Button>
      </CardContent>
    </Card>
  );
} 