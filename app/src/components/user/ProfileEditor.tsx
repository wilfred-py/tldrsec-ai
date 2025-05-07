'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { z } from 'zod';

// Types
interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  notificationPreference: string;
  theme: string;
  updatedAt: string;
}

interface ProfileEditorProps {
  onUpdateSuccess?: (profile: UserProfile) => void;
}

// Validation schema (same as the server-side one)
const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long').optional(),
  notificationPreference: z.enum(['immediate', 'digest', 'none']).optional(),
  theme: z.enum(['light', 'dark']).optional(),
});

export default function ProfileEditor({ onUpdateSuccess }: ProfileEditorProps) {
  const { isLoaded, isSignedIn } = useUser();
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    notificationPreference: 'immediate',
    theme: 'light',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch user profile
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    
    const fetchProfile = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/user/profile');
        
        if (!response.ok) {
          throw new Error('Failed to fetch profile');
        }
        
        const data = await response.json();
        setProfile(data);
        setFormData({
          name: data.name || '',
          notificationPreference: data.notificationPreference,
          theme: data.theme,
        });
      } catch (err) {
        setError('Error loading profile. Please try again.');
        console.error('Error fetching profile:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchProfile();
  }, [isLoaded, isSignedIn]);

  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    // Validate form data
    try {
      // Only include fields that have changed
      const changedData: Record<string, any> = {};
      if (profile?.name !== formData.name) changedData.name = formData.name;
      if (profile?.notificationPreference !== formData.notificationPreference) {
        changedData.notificationPreference = formData.notificationPreference;
      }
      if (profile?.theme !== formData.theme) changedData.theme = formData.theme;
      
      // If nothing changed, don't submit
      if (Object.keys(changedData).length === 0) {
        setSuccess('No changes to save.');
        return;
      }
      
      // Validate the changed data
      updateProfileSchema.parse(changedData);
      
      // Submit the changes
      setIsLoading(true);
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changedData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update profile');
      }
      
      const updatedProfile = await response.json();
      setProfile(updatedProfile);
      setSuccess('Profile updated successfully!');
      
      // Call the success callback if provided
      if (onUpdateSuccess) {
        onUpdateSuccess(updatedProfile);
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0]?.message || 'Invalid form data');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
      console.error('Error updating profile:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Show loading state when not loaded or still loading profile
  if (!isLoaded || (isLoading && !profile)) {
    return <div className="p-4 text-center">Loading profile...</div>;
  }
  
  // Show error if not signed in
  if (!isSignedIn) {
    return <div className="p-4 text-center text-red-500">You must be signed in to view your profile.</div>;
  }
  
  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Edit Profile</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}
      
      {success && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-md">
          {success}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Email
          </label>
          <input
            type="email"
            id="email"
            value={profile?.email || ''}
            disabled
            className="w-full p-2 border border-gray-300 rounded-md bg-gray-100 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Email cannot be changed</p>
        </div>
        
        <div className="mb-4">
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Name
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
        
        <div className="mb-4">
          <label htmlFor="notificationPreference" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Notification Preference
          </label>
          <select
            id="notificationPreference"
            name="notificationPreference"
            value={formData.notificationPreference}
            onChange={handleChange}
            className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="immediate">Immediate</option>
            <option value="digest">Daily Digest</option>
            <option value="none">None</option>
          </select>
        </div>
        
        <div className="mb-6">
          <label htmlFor="theme" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Theme
          </label>
          <select
            id="theme"
            name="theme"
            value={formData.theme}
            onChange={handleChange}
            className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
} 