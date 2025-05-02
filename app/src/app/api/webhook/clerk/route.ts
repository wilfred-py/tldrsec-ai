import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { createUser, getUserByEmail } from '@/lib/api/users';

// The Clerk webhook types
type WebhookEvent = {
  data: {
    id: string;
    email_addresses: {
      id: string;
      email_address: string;
      verification: {
        status: string;
      };
    }[];
    primary_email_address_id: string;
    first_name?: string;
    last_name?: string;
  };
  type: string;
};

export async function POST(req: NextRequest) {
  // Get the webhook secret from the environment variables
  const secret = process.env.CLERK_WEBHOOK_SECRET;

  if (!secret) {
    console.error('CLERK_WEBHOOK_SECRET is not set');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  // Get the headers
  const headersList = headers();
  const svix_id = headersList.get('svix-id');
  const svix_timestamp = headersList.get('svix-timestamp');
  const svix_signature = headersList.get('svix-signature');

  // If there are no headers, return a 400
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json(
      { error: 'Missing Svix headers' },
      { status: 400 }
    );
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with the secret
  const webhook = new Webhook(secret);

  let evt: WebhookEvent;

  try {
    // Verify the payload with the headers
    evt = webhook.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 400 }
    );
  }

  // Handle the webhook based on the event type
  switch (evt.type) {
    case 'user.created':
      return await handleUserCreated(evt.data);
    case 'user.updated':
      return await handleUserUpdated(evt.data);
    default:
      return NextResponse.json({ message: 'Webhook received' });
  }
}

// Handle the user.created event
async function handleUserCreated(userData: WebhookEvent['data']) {
  try {
    // Get the primary email
    const primaryEmail = userData.email_addresses.find(
      (email) => email.id === userData.primary_email_address_id
    );

    if (!primaryEmail) {
      console.error('No primary email found for user:', userData.id);
      return NextResponse.json(
        { error: 'No primary email found' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await getUserByEmail(primaryEmail.email_address);
    if (existingUser) {
      // User already exists, no need to create
      return NextResponse.json({ message: 'User already exists' });
    }

    // Create a new user in our database
    const newUser = await createUser({
      email: primaryEmail.email_address,
      name: userData.first_name && userData.last_name
        ? `${userData.first_name} ${userData.last_name}`
        : undefined,
      authProvider: 'clerk',
      authProviderId: userData.id,
    });

    return NextResponse.json({
      message: 'User created successfully',
      user: { id: newUser.id, email: newUser.email }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}

// Handle the user.updated event
async function handleUserUpdated(userData: WebhookEvent['data']) {
  try {
    // Get the primary email
    const primaryEmail = userData.email_addresses.find(
      (email) => email.id === userData.primary_email_address_id
    );

    if (!primaryEmail) {
      console.error('No primary email found for user:', userData.id);
      return NextResponse.json(
        { error: 'No primary email found' },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await getUserByEmail(primaryEmail.email_address);
    if (!existingUser) {
      // User doesn't exist, create them
      return await handleUserCreated(userData);
    }

    // For now, we're not updating any user data
    // This would be where you'd update the user's name, etc.

    return NextResponse.json({ message: 'User update processed' });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic'; 