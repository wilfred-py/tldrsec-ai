import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { getDefaultTickerPreferences } from '@/lib/user/preference-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Get default preferences from the centralized source
const DEFAULT_PREFERENCES = getDefaultTickerPreferences();

/**
 * PATCH /api/user/tickers/[id]
 * Update ticker preferences
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const prisma = getPrismaClient();
    const tickerId = (await params).id;
    const body = await request.json();

    if (!tickerId) {
      return NextResponse.json(
        { error: 'Ticker ID is required' },
        { status: 400 }
      );
    }

    // Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user details from Clerk
    const user = await currentUser();
    if (!user || !user.emailAddresses || user.emailAddresses.length === 0) {
      return NextResponse.json({ error: 'User email not available' }, { status: 400 });
    }

    const primaryEmail = user.emailAddresses[0].emailAddress;

    // Find user in database
    const dbUser = await prisma.user.findUnique({
      where: { email: primaryEmail }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found in database' }, { status: 404 });
    }

    // Verify the ticker belongs to the user
    const ticker = await prisma.ticker.findUnique({
      where: { id: tickerId }
    });

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker not found' }, { status: 404 });
    }

    if (ticker.userId !== dbUser.id) {
      return NextResponse.json({ error: 'Unauthorized to update this ticker' }, { status: 403 });
    }

    // Merge new preferences with existing ones (or defaults)
    const existingPreferences = ticker.preferences as Record<string, boolean> | null;
    const updatedPreferences = {
      ...DEFAULT_PREFERENCES,
      ...existingPreferences,
      ...body.preferences,
    };

    // Update the ticker preferences
    const updatedTicker = await prisma.ticker.update({
      where: { id: tickerId },
      data: { preferences: updatedPreferences },
    });

    // Invalidate Router Cache so back-nav to /dashboard reflects the change
    // immediately instead of waiting for the staleTimes.dynamic=10s window.
    revalidatePath('/dashboard');

    return NextResponse.json({
      success: true,
      ticker: {
        id: updatedTicker.id,
        symbol: updatedTicker.symbol,
        companyName: updatedTicker.companyName,
        preferences: updatedTicker.preferences,
      }
    });
  } catch (error) {
    console.error('Error updating ticker preferences:', error);
    return NextResponse.json(
      { error: 'Failed to update ticker preferences' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/user/tickers/[id]
 * Remove a ticker from the user's tracked list
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const prisma = getPrismaClient();
    const tickerId = (await params).id;
      
    if (!tickerId) {
      return NextResponse.json(
        { error: 'Ticker ID is required' }, 
        { status: 400 }
      );
    }
    
    // Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user details from Clerk
    const user = await currentUser();
    if (!user || !user.emailAddresses || user.emailAddresses.length === 0) {
      return NextResponse.json({ error: 'User email not available' }, { status: 400 });
    }

    const primaryEmail = user.emailAddresses[0].emailAddress;

    // Find user in database
    const dbUser = await prisma.user.findUnique({
      where: { email: primaryEmail }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found in database' }, { status: 404 });
    }

    // Verify the ticker belongs to the user
    const ticker = await prisma.ticker.findUnique({
      where: {
        id: tickerId
      }
    });

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker not found' }, { status: 404 });
    }

    if (ticker.userId !== dbUser.id) {
      return NextResponse.json({ error: 'Unauthorized to delete this ticker' }, { status: 403 });
    }

    // Delete the ticker
    await prisma.ticker.delete({
      where: {
        id: tickerId
      }
    });

    // Invalidate Router Cache so back-nav to /dashboard reflects the deletion
    // immediately instead of waiting for the staleTimes.dynamic=10s window.
    revalidatePath('/dashboard');

    // Return success
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting ticker:', error);
    return NextResponse.json(
      { error: 'Failed to delete ticker' }, 
      { status: 500 }
    );
  }
} 