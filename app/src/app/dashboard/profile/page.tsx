"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ProfileEditor from '@/components/user/ProfileEditor';

// Custom alert component
function Alert({ 
  children, 
  variant, 
  className 
}: { 
  children: React.ReactNode; 
  variant?: string; 
  className?: string;
}) {
  return (
    <div className={`p-4 rounded-md border ${variant === 'destructive' ? 'border-red-500 bg-red-50 text-red-800' : 'border-gray-300'} ${className || ''}`}>
      {children}
    </div>
  );
}

function AlertTitle({ children }: { children: React.ReactNode }) {
  return <div className="font-bold mb-2">{children}</div>;
}

function AlertDescription({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

// Simple warning icon
function WarningIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline mr-2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
  );
}

export default function ProfilePage() {
  const [isDbConnected, setIsDbConnected] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check health of API endpoint
    const checkApiHealth = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/user/profile');

        if (response.ok) {
          setIsDbConnected(true);
          setError(null);
        } else {
          const data = await response.json();
          setIsDbConnected(false);
          setError(data.message || 'Failed to connect to database');
        }
      } catch (err) {
        setIsDbConnected(false);
        setError('Network error while checking API health');
      } finally {
        setIsLoading(false);
      }
    };

    checkApiHealth();
  }, []);

  // Show spinner while loading
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Show error state if database connection failed
  if (isDbConnected === false) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile Settings</CardTitle>
            <CardDescription>
              Manage your account settings and profile information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive" className="mb-6">
              <WarningIcon />
              <AlertTitle>Database Connection Error</AlertTitle>
              <AlertDescription>
                {error || 'We are having trouble connecting to our database. Please try again later.'}
              </AlertDescription>
            </Alert>

            <div className="text-center mt-8">
              <p className="mb-4">The development team has been notified of this issue.</p>
              <Button onClick={() => window.location.reload()}>Try Again</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If database is connected, show the profile editor
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Settings</CardTitle>
          <CardDescription>
            Manage your account settings and profile information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileEditor />
        </CardContent>
      </Card>
    </div>
  );
} 