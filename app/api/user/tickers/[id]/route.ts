import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/user/tickers/[id]
 * Remove a ticker from the user's tracked list
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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