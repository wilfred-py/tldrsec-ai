import { SignUpButton as ClerkSignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui";
import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

type ButtonProps = React.ComponentProps<"button"> & 
  VariantProps<ReturnType<typeof cva>> & {
    asChild?: boolean;
  };

interface SignUpButtonProps extends Omit<ButtonProps, "children"> {
  showSignUpText?: boolean;
}

export default function SignUpButton({
  showSignUpText = true,
  ...props
}: SignUpButtonProps) {
  return (
    <ClerkSignUpButton>
      <Button variant="default" {...props}>
        {showSignUpText ? "Sign Up" : null}
      </Button>
    </ClerkSignUpButton>
  );
} 