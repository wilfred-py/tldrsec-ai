import { UserButton as ClerkUserButton } from "@clerk/nextjs";
export default function UserButton({ afterSignOutUrl = "/" }) {
    return (<ClerkUserButton afterSignOutUrl={afterSignOutUrl} appearance={{
            elements: {
                userButtonBox: "h-8 w-8",
                userButtonAvatarBox: "h-8 w-8",
            },
        }}/>);
}
