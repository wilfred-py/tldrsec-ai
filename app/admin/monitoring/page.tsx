import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { MonitoringDashboard } from "@/components/admin/monitoring-dashboard";

// Define admin user IDs or roles
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS?.split(',') || [];

export default async function AdminMonitoringPage() {
  const user = await currentUser();
  
  if (!user) {
    redirect("/sign-in");
  }

  // Check if user is admin
  const isAdmin = ADMIN_USER_IDS.includes(user.id) || 
    user.emailAddresses.some(email => 
      email.emailAddress.endsWith('@yourdomain.com') // Replace with your admin domain
    );

  if (!isAdmin) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">System Monitoring</h1>
        <p className="text-muted-foreground">
          Real-time monitoring and health dashboard for administrators
        </p>
      </div>
      
      <MonitoringDashboard />
    </div>
  );
}