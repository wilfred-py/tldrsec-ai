import { SignUp } from "@clerk/nextjs";

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <SignUp path="/verify-email" routing="path" />
    </div>
  );
} 