import { Metadata } from 'next';
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getUserByEmail } from '@/lib/api/users';
import ManualSyncButton from '@/components/auth/ManualSyncButton';

export const metadata: Metadata = {
  title: 'Auth Debugging | SECInsightAI',
  description: 'Admin tools for debugging authentication issues',
};

/**
 * Simple admin page for debugging authentication issues
 * This page requires authentication and shows user info for both
 * Clerk and database
 */
export default async function AuthDebugPage() {
  // Get authentication from Clerk
  const { userId } = await auth();
  
  // Redirect if not authenticated
  if (!userId) {
    redirect('/sign-in');
  }
  
  // Get the current user from Clerk
  const user = await currentUser();
  if (!user) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Authentication Debug</h1>
        <div className="p-4 border rounded-lg bg-amber-50 text-amber-800">
          <p>User is authenticated but unable to fetch user details from Clerk.</p>
          <p className="font-mono text-sm mt-2">User ID: {userId}</p>
        </div>
      </div>
    );
  }
  
  // Get primary email
  const primaryEmail = user.emailAddresses.find(
    email => email.id === user.primaryEmailAddressId
  )?.emailAddress;
  
  if (!primaryEmail) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Authentication Debug</h1>
        <div className="p-4 border rounded-lg bg-amber-50 text-amber-800">
          <p>User has no primary email address set in Clerk.</p>
          <p className="font-mono text-sm mt-2">User ID: {userId}</p>
        </div>
      </div>
    );
  }
  
  // Check if user exists in database
  const dbUser = primaryEmail ? await getUserByEmail(primaryEmail) : null;
  
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Authentication Debug</h1>
      
      <div className="grid md:grid-cols-2 gap-6">
        <div className="p-4 border rounded-lg space-y-4">
          <h2 className="text-lg font-semibold">Clerk User</h2>
          <dl className="space-y-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">User ID</dt>
              <dd className="font-mono text-sm">{user.id}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Email</dt>
              <dd className="font-mono text-sm">{primaryEmail}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Name</dt>
              <dd className="font-mono text-sm">{`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Not set'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">OAuth Providers</dt>
              <dd className="font-mono text-sm">
                {user.externalAccounts.length > 0 
                  ? user.externalAccounts.map(account => account.provider).join(', ')
                  : 'None'
                }
              </dd>
            </div>
          </dl>
        </div>
        
        <div className="p-4 border rounded-lg space-y-4">
          <h2 className="text-lg font-semibold">Database User</h2>
          {dbUser ? (
            <dl className="space-y-2">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">User ID</dt>
                <dd className="font-mono text-sm">{dbUser.id}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Email</dt>
                <dd className="font-mono text-sm">{dbUser.email}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Name</dt>
                <dd className="font-mono text-sm">{dbUser.name || 'Not set'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Auth Provider</dt>
                <dd className="font-mono text-sm">{dbUser.authProvider || 'Not set'}</dd>
              </div>
            </dl>
          ) : (
            <div className="p-4 border rounded-lg bg-amber-50 text-amber-800">
              <p>User not found in database!</p>
              <p className="text-sm mt-2">The user is authenticated in Clerk but not synchronized to the database.</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="p-4 border rounded-lg bg-gray-50">
        <h2 className="text-lg font-semibold mb-4">Sync Status</h2>
        <div className={`p-3 text-sm rounded-md ${dbUser ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
          {dbUser
            ? '✅ User is properly synchronized between Clerk and the database.'
            : '⚠️ User exists in Clerk but not in the database! Try using the sync button below.'
          }
        </div>
      </div>
      
      <ManualSyncButton />
    </div>
  );
} 