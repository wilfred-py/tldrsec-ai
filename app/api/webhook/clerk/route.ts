import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// This endpoint handles Clerk webhook events
// See https://clerk.com/docs/integration/webhooks for more information
export async function POST(req: Request) {
  const prisma = getPrismaClient();
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local');
  }

  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error missing Svix headers', {
      status: 400,
    });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with our secret
  const { Webhook } = await import('svix');
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new Response('Error verifying webhook', {
      status: 400,
    });
  }

  // Handle the webhook event based on the type
  const eventType = evt.type;
  console.log(`Webhook event type: ${eventType}`);

  switch (eventType) {
    case 'user.created':
      // Handle user creation event - sync Clerk user to database
      // Also merges pending onboarding data if exists (passwordless flow)
      try {
        const userData = evt.data;
        const primaryEmail = userData.email_addresses?.[0]?.email_address;

        if (primaryEmail && userData.id) {
          const normalizedEmail = primaryEmail.toLowerCase().trim();

          // Check for pending onboarding data (passwordless flow)
          let pendingOnboarding = null;
          try {
            pendingOnboarding = await prisma.pendingOnboarding.findUnique({
              where: { email: normalizedEmail }
            });
          } catch (pendingError) {
            console.error('Failed to check pending onboarding:', pendingError);
            // Continue without pending data if lookup fails
          }

          // Create user with onboardingCompleted=true if came through passwordless flow
          const newUser = await prisma.user.create({
            data: {
              id: userData.id, // Use Clerk user ID as primary key
              email: primaryEmail,
              authProvider: 'clerk',
              authProviderId: userData.id,
              name: userData.first_name ? `${userData.first_name} ${userData.last_name || ''}`.trim() : undefined,
              subscriptionTier: 'FREE', // Default tier for new users
              onboardingCompleted: !!pendingOnboarding, // Mark complete if came through passwordless flow
            }
          });
          console.log('User created in database:', newUser.id);

          // Merge pending tickers if exists
          if (pendingOnboarding) {
            console.log(`Merging pending onboarding for ${normalizedEmail}`);

            // Parse tickers from pending data
            const tickers = Array.isArray(pendingOnboarding.tickers)
              ? pendingOnboarding.tickers as Array<{ symbol: string; companyName: string }>
              : [];

            // Create tickers for the user
            for (const ticker of tickers) {
              try {
                await prisma.ticker.create({
                  data: {
                    symbol: ticker.symbol,
                    companyName: ticker.companyName,
                    userId: newUser.id
                  }
                });
                console.log(`Created ticker ${ticker.symbol} for user ${newUser.id}`);
              } catch (tickerError) {
                console.error(`Failed to create ticker ${ticker.symbol}:`, tickerError);
                // Continue with other tickers if one fails
              }
            }

            // Delete the pending onboarding record
            try {
              await prisma.pendingOnboarding.delete({
                where: { email: normalizedEmail }
              });
              console.log(`Deleted pending onboarding for ${normalizedEmail}`);
            } catch (deleteError) {
              console.error('Failed to delete pending onboarding:', deleteError);
            }
          }
        } else {
          console.error('Missing required user data in webhook:', { id: userData.id, email: primaryEmail });
        }
      } catch (error) {
        console.error('Failed to create user in database from webhook:', error);
      }
      break;
    case 'user.updated':
      // Handle user update event
      console.log('User updated:', evt.data);
      break;
    case 'user.deleted':
      // Handle user deletion event - remove user from database
      try {
        const userData = evt.data;
        if (userData.id) {
          // Delete user and their related data (cascading deletes handled by schema)
          await prisma.user.delete({
            where: { id: userData.id }
          });
          console.log('User deleted from database:', userData.id);
        }
      } catch (error) {
        console.error('Failed to delete user from database:', error);
      }
      break;
    // Add other event types as needed
    default:
      console.log('Unhandled webhook event type:', eventType);
  }

  return NextResponse.json({ success: true });
} 