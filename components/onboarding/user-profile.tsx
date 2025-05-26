"use client";

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { UIPreferences } from '@/lib/user/preference-types';

interface UserProfileFormProps {
  fullName: string;
  jobTitle: string;
  company: string;
  bio: string;
  uiPreferences: UIPreferences;
  onNameChange: (value: string) => void;
  onJobTitleChange: (value: string) => void;
  onCompanyChange: (value: string) => void;
  onBioChange: (value: string) => void;
  onThemeChange: (value: UIPreferences['theme']) => void;
  onDashboardLayoutChange: (value: UIPreferences['dashboardLayout']) => void;
}

export function UserProfileForm({
  fullName,
  jobTitle,
  company,
  bio,
  uiPreferences,
  onNameChange,
  onJobTitleChange,
  onCompanyChange,
  onBioChange,
  onThemeChange,
  onDashboardLayoutChange
}: UserProfileFormProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full Name</Label>
          <Input
            id="name"
            value={fullName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onNameChange(e.target.value)}
            placeholder="Your full name"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="jobTitle">Job Title</Label>
          <Input
            id="jobTitle"
            value={jobTitle}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onJobTitleChange(e.target.value)}
            placeholder="Your job title (optional)"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="company">Company</Label>
          <Input
            id="company"
            value={company}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onCompanyChange(e.target.value)}
            placeholder="Your company name (optional)"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Input
            id="bio"
            value={bio}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onBioChange(e.target.value)}
            placeholder="A short bio about yourself (optional)"
            className="h-24"
          />
        </div>
      </div>
      
      <div className="space-y-4">
        <h4 className="text-sm font-medium">Interface Preferences</h4>
        
        <div className="space-y-3">
          <Label htmlFor="theme">Theme</Label>
          <RadioGroup 
            id="theme"
            value={uiPreferences.theme}
            onValueChange={(value) => onThemeChange(value as UIPreferences['theme'])}
            className="flex space-x-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="light" id="light" />
              <Label htmlFor="light">Light</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="dark" id="dark" />
              <Label htmlFor="dark">Dark</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="system" id="system" />
              <Label htmlFor="system">System</Label>
            </div>
          </RadioGroup>
        </div>
        
        <div className="space-y-3">
          <Label htmlFor="dashboardLayout">Dashboard Layout</Label>
          <RadioGroup 
            id="dashboardLayout"
            value={uiPreferences.dashboardLayout}
            onValueChange={(value) => onDashboardLayoutChange(value as UIPreferences['dashboardLayout'])}
            className="flex space-x-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="compact" id="compact" />
              <Label htmlFor="compact">Compact</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="detailed" id="detailed" />
              <Label htmlFor="detailed">Detailed</Label>
            </div>
          </RadioGroup>
        </div>
      </div>
    </div>
  );
} 