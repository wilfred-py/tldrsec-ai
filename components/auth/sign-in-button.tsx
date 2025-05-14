import { SignInButton as ClerkSignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui";
import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

type ButtonProps = React.ComponentProps<"button"> & 
  VariantProps<ReturnType<typeof cva>> & {
    asChild?: boolean;
  };

interface SignInButtonProps extends Omit<ButtonProps, "children"> {
  showSignInText?: boolean;
}

export default function SignInButton({
  showSignInText = true,
  ...props
}: SignInButtonProps) {
  return (
    <ClerkSignInButton>
      <Button variant="default" {...props}>
        {showSignInText ? "Sign In" : null}
      </Button>
    </ClerkSignInButton>
  );
} 