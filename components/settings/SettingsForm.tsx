'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from "@/components/ui";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { NotificationPreference } from '@/lib/email/notification-types';
import { 
  UserPreferences, 
  FilingTypePreferences, 
  NotificationContentPreferences,
} from '@/lib/user/preference-types';
import { toast } from 'sonner';

export default function SettingsForm() {
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
  
  const handleFilingTypeChange = (category: keyof FilingTypePreferences, key: string, checked: boolean) => {
    if (!preferences) return;
    
    setPreferences({
      ...preferences,
      notifications: {
        ...preferences.notifications,
        filingTypes: {
          ...preferences.notifications.filingTypes,
          [category]: {
            ...preferences.notifications.filingTypes[category],
            [key]: checked
          }
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
              <Label htmlFor="none">None - Don&#39;t send email notifications</Label>
            </div>
          </RadioGroup>
        </div>
        
        {/* Filing Types */}
        <div className="space-y-6">
          <h3 className="text-lg font-medium">Filing Types to Receive</h3>
          
          {/* Annual Reports */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Annual Reports</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="form10K">Annual Reports (10-K)</Label>
                <Switch
                  id="form10K"
                  checked={preferences.notifications.filingTypes.annualReports.form10K}
                  onCheckedChange={(checked: boolean) => handleFilingTypeChange('annualReports', 'form10K', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="form10KA">Annual Report Amendments (10-K/A)</Label>
                <Switch
                  id="form10KA"
                  checked={preferences.notifications.filingTypes.annualReports.form10KA}
                  onCheckedChange={(checked: boolean) => handleFilingTypeChange('annualReports', 'form10KA', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="form20F">Foreign Issuer Annual Reports (20-F)</Label>
                <Switch
                  id="form20F"
                  checked={preferences.notifications.filingTypes.annualReports.form20F}
                  onCheckedChange={(checked: boolean) => handleFilingTypeChange('annualReports', 'form20F', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="form40F">Canadian Issuer Annual Reports (40-F)</Label>
                <Switch
                  id="form40F"
                  checked={preferences.notifications.filingTypes.annualReports.form40F}
                  onCheckedChange={(checked: boolean) => handleFilingTypeChange('annualReports', 'form40F', checked)}
                />
              </div>
            </div>
          </div>
          
          {/* Quarterly Reports */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Quarterly Reports</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="form10Q">Quarterly Reports (10-Q)</Label>
                <Switch
                  id="form10Q"
                  checked={preferences.notifications.filingTypes.quarterlyReports.form10Q}
                  onCheckedChange={(checked: boolean) => handleFilingTypeChange('quarterlyReports', 'form10Q', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="form10QA">Quarterly Report Amendments (10-Q/A)</Label>
                <Switch
                  id="form10QA"
                  checked={preferences.notifications.filingTypes.quarterlyReports.form10QA}
                  onCheckedChange={(checked: boolean) => handleFilingTypeChange('quarterlyReports', 'form10QA', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="form6K">Foreign Issuer Reports (6-K)</Label>
                <Switch
                  id="form6K"
                  checked={preferences.notifications.filingTypes.quarterlyReports.form6K}
                  onCheckedChange={(checked: boolean) => handleFilingTypeChange('quarterlyReports', 'form6K', checked)}
                />
              </div>
            </div>
          </div>
          
          {/* Current Events */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Current Events</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="form8K">Material Events (8-K)</Label>
                <Switch
                  id="form8K"
                  checked={preferences.notifications.filingTypes.currentEvents.form8K}
                  onCheckedChange={(checked: boolean) => handleFilingTypeChange('currentEvents', 'form8K', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="form8KA">Material Events Amendments (8-K/A)</Label>
                <Switch
                  id="form8KA"
                  checked={preferences.notifications.filingTypes.currentEvents.form8KA}
                  onCheckedChange={(checked: boolean) => handleFilingTypeChange('currentEvents', 'form8KA', checked)}
                />
              </div>
            </div>
          </div>
          
          {/* Insider Trading */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Insider Trading</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="form4">Changes in Ownership (Form 4)</Label>
                <Switch
                  id="form4"
                  checked={preferences.notifications.filingTypes.insiderTrading.form4}
                  onCheckedChange={(checked: boolean) => handleFilingTypeChange('insiderTrading', 'form4', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="form3">Initial Ownership (Form 3)</Label>
                <Switch
                  id="form3"
                  checked={preferences.notifications.filingTypes.insiderTrading.form3}
                  onCheckedChange={(checked: boolean) => handleFilingTypeChange('insiderTrading', 'form3', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="form5">Annual Ownership (Form 5)</Label>
                <Switch
                  id="form5"
                  checked={preferences.notifications.filingTypes.insiderTrading.form5}
                  onCheckedChange={(checked: boolean) => handleFilingTypeChange('insiderTrading', 'form5', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="form144">Notice of Sale (Form 144)</Label>
                <Switch
                  id="form144"
                  checked={preferences.notifications.filingTypes.insiderTrading.form144}
                  onCheckedChange={(checked: boolean) => handleFilingTypeChange('insiderTrading', 'form144', checked)}
                />
              </div>
            </div>
          </div>
          
          {/* Beneficial Ownership */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Beneficial Ownership</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="formSC13D">Beneficial Ownership (Schedule 13D)</Label>
                <Switch
                  id="formSC13D"
                  checked={preferences.notifications.filingTypes.beneficialOwnership.formSC13D}
                  onCheckedChange={(checked: boolean) => handleFilingTypeChange('beneficialOwnership', 'formSC13D', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="formSC13G">Passive Investors (Schedule 13G)</Label>
                <Switch
                  id="formSC13G"
                  checked={preferences.notifications.filingTypes.beneficialOwnership.formSC13G}
                  onCheckedChange={(checked: boolean) => handleFilingTypeChange('beneficialOwnership', 'formSC13G', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="form13F">Institutional Holdings (13F)</Label>
                <Switch
                  id="form13F"
                  checked={preferences.notifications.filingTypes.beneficialOwnership.form13F}
                  onCheckedChange={(checked: boolean) => handleFilingTypeChange('beneficialOwnership', 'form13F', checked)}
                />
              </div>
            </div>
          </div>
          
          {/* Registration Filings */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Registration Filings</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="formS1">Registration Statement (S-1)</Label>
                <Switch
                  id="formS1"
                  checked={preferences.notifications.filingTypes.registrationFilings.formS1}
                  onCheckedChange={(checked: boolean) => handleFilingTypeChange('registrationFilings', 'formS1', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="formS3">Simplified Registration (S-3)</Label>
                <Switch
                  id="formS3"
                  checked={preferences.notifications.filingTypes.registrationFilings.formS3}
                  onCheckedChange={(checked: boolean) => handleFilingTypeChange('registrationFilings', 'formS3', checked)}
                />
              </div>
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