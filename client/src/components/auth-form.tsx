import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FiGithub, FiTwitter } from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";
import { useAuth } from "@/lib/auth";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export function AuthForm() {
  const { login, register, loginWithOAuth, isLoading } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [_, navigate] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (isRegistering) {
        await register(username, email, password);
        toast({
          title: "Account created",
          description: "You've been successfully registered and logged in.",
        });
        // Navigate to dashboard after registration
        navigate("/dashboard");
      } else {
        await login(email, password);
        toast({
          title: "Welcome back",
          description: "You've been successfully logged in.",
        });
        // Navigate to dashboard after login
        navigate("/dashboard");
      }
    } catch (error) {
      toast({
        title: "Authentication failed",
        description: isRegistering 
          ? "There was an error creating your account." 
          : "Invalid email or password.",
        variant: "destructive",
      });
    }
  };

  const handleOAuthLogin = async (provider: string) => {
    try {
      // In a real implementation, this would redirect to the OAuth provider
      // and then handle the callback. For this demo, we'll simulate it.
      
      const mockOAuthData = {
        provider,
        providerId: `mock-${provider}-id-${Date.now()}`,
        email: `user-${Date.now()}@example.com`,
        username: `User${Date.now().toString().substring(5)}`,
      };
      
      await loginWithOAuth(
        mockOAuthData.provider,
        mockOAuthData.providerId,
        mockOAuthData.email,
        mockOAuthData.username
      );
      
      toast({
        title: "Successfully logged in",
        description: `Authenticated with ${provider}`,
      });
      
      // Navigate to dashboard after OAuth login
      navigate("/dashboard");
    } catch (error) {
      toast({
        title: "Authentication failed",
        description: `Could not authenticate with ${provider}`,
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="max-w-md w-full">
      <CardContent className="pt-6 space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-primary">tldrSEC</h1>
          <p className="mt-2 text-muted-foreground">AI-Powered SEC Filings Summarizer</p>
        </div>
        
        <div className="space-y-4">
          <Button
            variant="outline"
            className="w-full flex items-center justify-center gap-2"
            onClick={() => handleOAuthLogin("google")}
            disabled={isLoading}
          >
            <FcGoogle className="h-5 w-5" />
            <span>Continue with Google</span>
          </Button>
          
          <Button
            variant="outline"
            className="w-full flex items-center justify-center gap-2"
            onClick={() => handleOAuthLogin("github")}
            disabled={isLoading}
          >
            <FiGithub className="h-5 w-5" />
            <span>Continue with GitHub</span>
          </Button>
          
          <Button
            variant="outline"
            className="w-full flex items-center justify-center gap-2"
            onClick={() => handleOAuthLogin("twitter")}
            disabled={isLoading}
          >
            <FiTwitter className="h-5 w-5" />
            <span>Continue with Twitter</span>
          </Button>
        </div>
        
        <div className="flex items-center justify-center">
          <Separator className="flex-grow" />
          <span className="px-3 text-sm text-muted-foreground">OR</span>
          <Separator className="flex-grow" />
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegistering && (
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="Choose a username"
                disabled={isLoading}
              />
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
              disabled={isLoading}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
              disabled={isLoading}
            />
          </div>
          
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <LoadingSpinner size="sm" />
            ) : isRegistering ? (
              "Sign Up"
            ) : (
              "Sign In"
            )}
          </Button>
        </form>
        
        <div className="text-center text-sm">
          <span className="text-muted-foreground">
            {isRegistering ? "Already have an account? " : "Don't have an account? "}
          </span>
          <Button
            variant="link"
            className="p-0"
            onClick={() => setIsRegistering(!isRegistering)}
            disabled={isLoading}
          >
            {isRegistering ? "Sign In" : "Sign Up"}
          </Button>
        </div>
        
        <div className="text-xs text-center text-muted-foreground">
          By signing in, you agree to our{" "}
          <a href="#" className="underline text-primary hover:text-primary/80">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="#" className="underline text-primary hover:text-primary/80">
            Privacy Policy
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
