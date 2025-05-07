import { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Profile | SECInsightAI',
  description: 'Manage your profile settings and preferences',
};

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return children;
} 