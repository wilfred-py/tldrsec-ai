import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard";
import SettingsForm from "@/components/settings/SettingsForm";
import UserProfileSection from "@/components/settings/UserProfileSection";

export default async function SettingsPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <div className="space-y-8">
      <DashboardHeader heading="Settings" description="Manage your account settings and preferences." />

      {/* User Profile Section */}
      <UserProfileSection user={user} />

      {/* Notification Preferences */}
      <SettingsForm userId={user.id} />
    </div>
  );
} 