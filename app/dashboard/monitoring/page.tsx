import { Metadata } from 'next';
import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { CronMonitoringDashboard } from '@/components/dashboard/cron-monitoring';
import { logger } from '@/lib/logging';

const monitoringLogger = logger.child('monitoring-page-access');

export const metadata: Metadata = {
  title: 'Cron Job Monitoring | tldrsec.ai',
  description: 'Monitor SEC filing processing jobs, costs, and performance metrics',
};

interface MonitoringPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function MonitoringPage({ searchParams }: MonitoringPageProps) {
  const resolvedSearchParams = await searchParams;
  const user = await currentUser();
  
  if (!user) {
    redirect('/sign-in');
  }

  // Check if user is admin
  const adminEmail = process.env.ADMIN_EMAIL;
  const userEmail = user.emailAddresses[0]?.emailAddress;
  
  if (!adminEmail || userEmail !== adminEmail) {
    // Log access attempt for security auditing
    monitoringLogger.warn('Unauthorized access attempt to monitoring dashboard', {
      userId: user.id,
      userEmail: userEmail,
      timestamp: new Date().toISOString(),
      attemptedResource: '/dashboard/monitoring'
    });

    // Redirect back to dashboard with error message in URL params
    const redirectUrl = resolvedSearchParams.from && typeof resolvedSearchParams.from === 'string' 
      ? decodeURIComponent(resolvedSearchParams.from)
      : '/dashboard';
    
    redirect(`${redirectUrl}?error=access_denied&resource=monitoring`);
  }

  // Log successful admin access
  monitoringLogger.info('Admin access granted to monitoring dashboard', {
    userId: user.id,
    userEmail: userEmail,
    timestamp: new Date().toISOString(),
    resource: '/dashboard/monitoring'
  });

  return (
    <div className="container mx-auto py-8">
      <CronMonitoringDashboard />
    </div>
  );
}