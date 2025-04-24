import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Separator } from "@/components/ui/separator";

export default function Settings() {
  const { user, logout } = useAuth();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [darkMode, setDarkMode] = useState(user?.darkMode || false);
  
  // Get user settings
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ["/api/settings"],
  });
  
  // Mutations for updating settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings updated",
        description: "Your preferences have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update settings.",
        variant: "destructive",
      });
    },
  });

  // Form state
  const [emailDigestFrequency, setEmailDigestFrequency] = useState<string>("daily");
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState<boolean>(true);

  // Update form values when settings load
  useEffect(() => {
    if (settings) {
      setEmailDigestFrequency(settings.emailDigestFrequency || "daily");
      setEmailNotificationsEnabled(settings.emailNotificationsEnabled || true);
    }
  }, [settings]);

  // Track the active section for highlighting in the sidebar
  const [activeSection, setActiveSection] = useState("account");
  
  useEffect(() => {
    const handleScroll = () => {
      const sections = ["account", "notifications", "appearance", "subscription"];
      
      for (const section of sections) {
        const element = document.getElementById(section);
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.top <= 100 && rect.bottom >= 100) {
            setActiveSection(section);
            break;
          }
        }
      }
    };
    
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleDarkModeToggle = () => {
    setDarkMode(!darkMode);
    
    // Client-side immediate toggle
    const isDark = document.documentElement.classList.contains('dark');
    
    if (isDark) {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
    
    // Asynchronously update the server setting
    apiRequest("POST", "/api/settings/dark-mode", {
      darkMode: !isDark,
    }).catch(error => {
      console.error("Failed to update dark mode setting:", error);
      toast({
        title: "Error",
        description: "Failed to save dark mode preference.",
        variant: "destructive",
      });
    });
  };

  const handleSaveNotificationSettings = () => {
    updateSettingsMutation.mutate({
      emailDigestFrequency,
      emailNotificationsEnabled,
    });
  };

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar 
        expanded={sidebarExpanded} 
        onToggle={() => setSidebarExpanded(!sidebarExpanded)}
        user={user}
      />
      
      {/* Mobile sidebar overlay */}
      {sidebarExpanded && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarExpanded(false)}
        />
      )}
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
          onMenuClick={() => setSidebarExpanded(!sidebarExpanded)}
          onDarkModeToggle={handleDarkModeToggle}
          darkMode={darkMode}
          user={user}
          onLogout={logout}
        />
        
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-slate-50 dark:bg-slate-900">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row gap-6 md:gap-10">
              {/* Sidebar navigation */}
              <div className="md:w-1/4 lg:w-1/5">
                <div className="md:sticky md:top-4">
                  <h1 className="text-2xl font-bold mb-4">Settings</h1>
                  
                  <nav className="space-y-1">
                    <a 
                      href="#account" 
                      className={`block py-2 px-3 border-l-2 transition-colors text-sm font-medium ${
                        activeSection === "account" 
                          ? "border-primary text-primary" 
                          : "border-transparent hover:border-primary/50 hover:text-primary/90"
                      }`}
                    >
                      Account
                    </a>
                    <a 
                      href="#notifications" 
                      className={`block py-2 px-3 border-l-2 transition-colors text-sm font-medium ${
                        activeSection === "notifications" 
                          ? "border-primary text-primary" 
                          : "border-transparent hover:border-primary/50 hover:text-primary/90"
                      }`}
                    >
                      Notifications
                    </a>
                    <a 
                      href="#appearance" 
                      className={`block py-2 px-3 border-l-2 transition-colors text-sm font-medium ${
                        activeSection === "appearance" 
                          ? "border-primary text-primary" 
                          : "border-transparent hover:border-primary/50 hover:text-primary/90"
                      }`}
                    >
                      Appearance
                    </a>
                    <a 
                      href="#subscription" 
                      className={`block py-2 px-3 border-l-2 transition-colors text-sm font-medium ${
                        activeSection === "subscription" 
                          ? "border-primary text-primary" 
                          : "border-transparent hover:border-primary/50 hover:text-primary/90"
                      }`}
                    >
                      Subscription
                    </a>
                  </nav>
                </div>
              </div>
              
              {/* Main content */}
              <div className="md:w-3/4 lg:w-4/5 space-y-6">
                {/* Account Information */}
                <Card id="account">
                  <CardHeader>
                    <CardTitle>Account Information</CardTitle>
                    <CardDescription>
                      View your account details
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="username">Username</Label>
                        <Input 
                          id="username" 
                          value={user?.username || ""} 
                          disabled 
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input 
                          id="email" 
                          type="email" 
                          value={user?.email || ""} 
                          disabled 
                        />
                      </div>
                    </div>
                    
                    <div className="text-xs text-muted-foreground">
                      {user?.lastLoginAt && (
                        <p>Last login: {new Date(user.lastLoginAt).toLocaleString()}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
                
                {/* Notification Settings */}
                <Card id="notifications">
                  <CardHeader>
                    <CardTitle>Notifications</CardTitle>
                    <CardDescription>
                      Configure how you receive SEC filing summaries.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {isLoadingSettings ? (
                      <div className="flex justify-center py-4">
                        <LoadingSpinner />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label htmlFor="email-notifications">Email Notifications</Label>
                            <p className="text-sm text-muted-foreground">
                              Receive email notifications for new SEC filings.
                            </p>
                          </div>
                          <Switch
                            id="email-notifications"
                            checked={emailNotificationsEnabled}
                            onCheckedChange={setEmailNotificationsEnabled}
                          />
                        </div>
                        
                        <Separator />
                        
                        <div className="space-y-3">
                          <Label>Email Frequency</Label>
                          <RadioGroup
                            value={emailDigestFrequency}
                            onValueChange={setEmailDigestFrequency}
                            className="flex flex-col space-y-1"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="immediate" id="immediate" />
                              <Label htmlFor="immediate" className="font-normal">
                                Immediate - Send each summary as it's generated
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="daily" id="daily" />
                              <Label htmlFor="daily" className="font-normal">
                                Daily - Receive a digest of all summaries once per day
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="weekly" id="weekly" />
                              <Label htmlFor="weekly" className="font-normal">
                                Weekly - Receive a digest of all summaries once per week
                              </Label>
                            </div>
                          </RadioGroup>
                        </div>
                        
                        <Button 
                          onClick={handleSaveNotificationSettings}
                          disabled={updateSettingsMutation.isPending}
                        >
                          {updateSettingsMutation.isPending ? (
                            <>
                              <LoadingSpinner size="sm" className="mr-2" />
                              Saving...
                            </>
                          ) : (
                            "Save Notification Settings"
                          )}
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
                
                {/* Appearance Settings */}
                <Card id="appearance">
                  <CardHeader>
                    <CardTitle>Appearance</CardTitle>
                    <CardDescription>
                      Customize the look and feel of the application.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="dark-mode">Dark Mode</Label>
                        <p className="text-sm text-muted-foreground">
                          Use dark theme for the application.
                        </p>
                      </div>
                      <Switch
                        id="dark-mode"
                        checked={darkMode}
                        onCheckedChange={handleDarkModeToggle}
                      />
                    </div>
                  </CardContent>
                </Card>
                
                {/* Subscription Settings */}
                <Card id="subscription">
                  <CardHeader>
                    <CardTitle>Subscription</CardTitle>
                    <CardDescription>
                      Manage your tldrSEC subscription and billing.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <h3 className="text-lg font-medium">
                          {user?.subscriptionStatus === 'premium' 
                            ? 'Premium Subscription' 
                            : 'Free Plan'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {user?.subscriptionStatus === 'premium'
                            ? 'You have access to all premium features.'
                            : 'Upgrade to premium for additional features.'}
                        </p>
                      </div>
                      
                      {user?.subscriptionStatus === 'premium' ? (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button
                            variant="outline"
                            onClick={async () => {
                              try {
                                await apiRequest("DELETE", "/api/get-or-create-subscription");
                                queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
                                toast({
                                  title: "Subscription Cancelled",
                                  description: "Your subscription has been cancelled.",
                                });
                              } catch (error) {
                                toast({
                                  title: "Error",
                                  description: "Failed to cancel subscription.",
                                  variant: "destructive",
                                });
                              }
                            }}
                          >
                            Cancel Subscription
                          </Button>
                          <Button disabled className="bg-green-600 hover:bg-green-700">
                            Active
                          </Button>
                        </div>
                      ) : (
                        <Button 
                          onClick={() => window.location.href = '/subscribe'}
                          className="bg-primary hover:bg-primary/90"
                        >
                          Upgrade to Premium
                        </Button>
                      )}
                    </div>
                    
                    {user?.subscriptionStatus === 'premium' && (
                      <div className="rounded-md bg-muted p-4 mt-4">
                        <div className="text-sm">
                          <p className="font-medium">Subscription Details</p>
                          <p className="mt-1 text-muted-foreground">
                            Your premium subscription gives you access to unlimited SEC filing summaries, 
                            AI analysis, and priority email alerts.
                          </p>
                          <p className="mt-3 text-xs text-muted-foreground">
                            Subscription ID: {user.stripeSubscriptionId?.substring(0, 8)}...
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {user?.subscriptionStatus !== 'premium' && (
                      <div className="rounded-md bg-muted p-4 mt-4">
                        <div className="text-sm">
                          <p className="font-medium">Premium Benefits</p>
                          <ul className="mt-2 space-y-1 list-disc list-inside text-muted-foreground">
                            <li>Unlimited SEC filing summaries and insights</li>
                            <li>Advanced AI analysis of financial statements</li>
                            <li>Priority email alerts for critical filings</li>
                            <li>Export summaries to PDF or Excel</li>
                            <li>Historical filing database access</li>
                          </ul>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}