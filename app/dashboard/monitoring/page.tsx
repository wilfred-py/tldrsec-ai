import { Metadata } from 'next';
import { CronMonitoringDashboard } from '@/components/dashboard/cron-monitoring';

export const metadata: Metadata = {
  title: 'Cron Job Monitoring | tldrsec.ai',
  description: 'Monitor SEC filing processing jobs, costs, and performance metrics',
};

export default function MonitoringPage() {
  return (
    <div className="container mx-auto py-8">
      <CronMonitoringDashboard />
    </div>
  );
}