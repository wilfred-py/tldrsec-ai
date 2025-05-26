"use client";

import { useState } from "react";
import { useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

// Define form validation schema
const formSchema = z.object({
  verificationCode: z.string().min(6, { message: "Verification code must be at least 6 characters" }),
});

type FormValues = z.infer<typeof formSchema>;

export default function VerifyEmailPage() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Initialize form with react-hook-form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      verificationCode: "",
    },
  });

  // Handle form submission
  async function onSubmit(values: FormValues) {
    if (!isLoaded) return;

    try {
      setIsLoading(true);
      
      // Submit the verification code
      const result = await signUp.attemptEmailAddressVerification({
        code: values.verificationCode,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        toast.success("Email verified! Redirecting to dashboard...");
        router.push("/onboarding");
      } else {
        toast.error("Verification incomplete. Please try again.");
      }
    } catch (err: any) {
      console.error("Verification error:", err);
      toast.error(err.errors?.[0]?.message || "Failed to verify email. Please check your code.");
    } finally {
      setIsLoading(false);
    }
  }

  const handleResendCode = async () => {
    if (!isLoaded) return;

    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      toast.success("Verification code resent. Please check your inbox.");
    } catch (err: any) {
      console.error("Resend error:", err);
      toast.error(err.errors?.[0]?.message || "Failed to resend verification code.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Verify Your Email</CardTitle>
          <CardDescription>
            Please enter the verification code sent to your email
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="verificationCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verification Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="123456"
                        autoComplete="one-time-code"
                        disabled={isLoading}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify Email"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4 border-t p-4">
          <p className="text-sm text-muted-foreground text-center">
            Didn't receive a code?{" "}
            <Button
              variant="link"
              className="p-0 h-auto font-normal text-blue-600 hover:text-blue-800"
              onClick={handleResendCode}
              disabled={isLoading}
            >
              Resend code
            </Button>
          </p>
          <p className="text-sm text-muted-foreground text-center">
            <Link href="/sign-in" className="text-blue-600 hover:text-blue-800">
              Back to sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
} 