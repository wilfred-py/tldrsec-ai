import { UserButton as ClerkUserButton } from "@clerk/nextjs";

interface UserButtonProps {
  afterSignOutUrl?: string;
}

export default function UserButton({ afterSignOutUrl = "/" }: UserButtonProps) {
  return (
    <ClerkUserButton
      afterSignOutUrl={afterSignOutUrl}
      appearance={{
        elements: {
          userButtonBox: "h-8 w-8",
          userButtonAvatarBox: "h-8 w-8",
        },
      }}
    />
  );
} 