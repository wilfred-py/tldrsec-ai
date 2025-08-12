import { Metadata } from 'next';
import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { CronMonitoringDashboard } from '@/components/dashboard/cron-monitoring';

export const metadata: Metadata = {
  title: 'Cron Job Monitoring | tldrsec.ai',
  description: 'Monitor SEC filing processing jobs, costs, and performance metrics',
};

export default async function MonitoringPage() {
  const user = await currentUser();
  
  if (!user) {
    redirect('/sign-in');
  }

  // Check if user is admin
  const adminEmail = process.env.ADMIN_EMAIL;
  const userEmail = user.emailAddresses[0]?.emailAddress;
  
  if (!adminEmail || userEmail !== adminEmail) {
    redirect('/dashboard');
  }

  return (
    <div className="container mx-auto py-8">
      <CronMonitoringDashboard />
    </div>
  );
}