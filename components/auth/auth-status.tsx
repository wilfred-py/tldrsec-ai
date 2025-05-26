"use client";

import { useAuthContext } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * A component that displays the current authentication status
 * Useful for debugging and demonstration purposes
 */
export function AuthStatus() {
  const { isAuthenticated, isLoading, userName, userEmail, signOut, redirectToSignIn, redirectToSignUp } = useAuthContext();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Authentication Status</CardTitle>
        <CardDescription>Current user authentication state</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="text-sm font-medium">Status:</div>
          <div className="text-sm">
            {isLoading ? (
              <span className="text-yellow-500">Loading...</span>
            ) : isAuthenticated ? (
              <span className="text-green-500">Authenticated</span>
            ) : (
              <span className="text-red-500">Not Authenticated</span>
            )}
          </div>
          
          {isAuthenticated && (
            <>
              <div className="text-sm font-medium">User:</div>
              <div className="text-sm">{userName || "N/A"}</div>
              
              <div className="text-sm font-medium">Email:</div>
              <div className="text-sm">{userEmail || "N/A"}</div>
            </>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-end space-x-2">
        {isAuthenticated ? (
          <Button variant="outline" onClick={() => signOut()}>Sign Out</Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => redirectToSignUp()}>Sign Up</Button>
            <Button onClick={() => redirectToSignIn()}>Sign In</Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}

export default AuthStatus; 