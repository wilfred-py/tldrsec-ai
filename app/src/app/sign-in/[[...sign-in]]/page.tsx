import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">tldrSEC</h1>
          <p className="text-muted-foreground mt-2">Sign in to your account</p>
        </div>
        
        <SignIn />
      </div>
    </div>
  );
} 