"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { NotificationPreference } from '@/lib/email/notification-service';
import { FilingTypePreferences, NotificationContentPreferences } from '@/lib/user/preference-types';

interface NotificationPreferencesProps {
  emailFrequency: NotificationPreference;
  filingTypes: FilingTypePreferences;
  contentPreferences: NotificationContentPreferences;
  onEmailFrequencyChange: (value: NotificationPreference) => void;
  onFilingTypeChange: (key: keyof FilingTypePreferences, value: boolean) => void;
  onContentPreferenceChange: (key: keyof NotificationContentPreferences, value: boolean) => void;
}

export function NotificationPreferences({
  emailFrequency,
  filingTypes,
  contentPreferences,
  onEmailFrequencyChange,
  onFilingTypeChange,
  onContentPreferenceChange
}: NotificationPreferencesProps) {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-medium mb-3">Email Notification Frequency</h4>
        <RadioGroup 
          value={emailFrequency} 
          onValueChange={(value) => onEmailFrequencyChange(value as NotificationPreference)}
          className="space-y-3"
        >
          <div className="flex items-start space-x-2">
            <RadioGroupItem value={NotificationPreference.IMMEDIATE} id="immediate" />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="immediate" className="font-medium">Immediate</Label>
              <p className="text-sm text-muted-foreground">
                Send notifications as soon as new filings are available
              </p>
            </div>
          </div>
          
          <div className="flex items-start space-x-2">
            <RadioGroupItem value={NotificationPreference.DAILY} id="daily" />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="daily" className="font-medium">Daily Digest</Label>
              <p className="text-sm text-muted-foreground">
                Send a daily summary of all filings
              </p>
            </div>
          </div>
          
          <div className="flex items-start space-x-2">
            <RadioGroupItem value={NotificationPreference.NONE} id="none" />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="none" className="font-medium">No Email Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Only show filings in dashboard, no emails
              </p>
            </div>
          </div>
        </RadioGroup>
      </div>

      <div>
        <h4 className="text-sm font-medium mb-3">Filing Types to Track</h4>
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="form10K">Annual Reports (10-K)</Label>
                <p className="text-xs text-muted-foreground">
                  Comprehensive annual financial reports
                </p>
              </div>
              <Switch 
                id="form10K"
                checked={filingTypes.form10K}
                onCheckedChange={(checked) => onFilingTypeChange('form10K', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="form10Q">Quarterly Reports (10-Q)</Label>
                <p className="text-xs text-muted-foreground">
                  Quarterly financial reports
                </p>
              </div>
              <Switch 
                id="form10Q"
                checked={filingTypes.form10Q}
                onCheckedChange={(checked) => onFilingTypeChange('form10Q', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="form8K">Material Events (8-K)</Label>
                <p className="text-xs text-muted-foreground">
                  Significant events that require immediate disclosure
                </p>
              </div>
              <Switch 
                id="form8K"
                checked={filingTypes.form8K}
                onCheckedChange={(checked) => onFilingTypeChange('form8K', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="form4">Insider Trading (Form 4)</Label>
                <p className="text-xs text-muted-foreground">
                  Reports of insider trading activity
                </p>
              </div>
              <Switch 
                id="form4"
                checked={filingTypes.form4}
                onCheckedChange={(checked) => onFilingTypeChange('form4', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="otherFilings">Other Filings</Label>
                <p className="text-xs text-muted-foreground">
                  Other SEC filing types
                </p>
              </div>
              <Switch 
                id="otherFilings"
                checked={filingTypes.otherFilings}
                onCheckedChange={(checked) => onFilingTypeChange('otherFilings', checked)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h4 className="text-sm font-medium mb-3">Content Preferences</h4>
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="includeSummary">Include AI Summaries</Label>
                <p className="text-xs text-muted-foreground">
                  Include AI-generated summaries of filings
                </p>
              </div>
              <Switch 
                id="includeSummary"
                checked={contentPreferences.includeSummary}
                onCheckedChange={(checked) => onContentPreferenceChange('includeSummary', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="includeFilingDetails">Include Filing Details</Label>
                <p className="text-xs text-muted-foreground">
                  Include key details from the filing
                </p>
              </div>
              <Switch 
                id="includeFilingDetails"
                checked={contentPreferences.includeFilingDetails}
                onCheckedChange={(checked) => onContentPreferenceChange('includeFilingDetails', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="includeAnalysis">Include AI Analysis</Label>
                <p className="text-xs text-muted-foreground">
                  Include AI-generated analysis of key points
                </p>
              </div>
              <Switch 
                id="includeAnalysis"
                checked={contentPreferences.includeAnalysis}
                onCheckedChange={(checked) => onContentPreferenceChange('includeAnalysis', checked)}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 