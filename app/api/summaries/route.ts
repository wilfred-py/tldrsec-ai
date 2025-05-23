import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { getMockSummaries } from '@/lib/api/summary-service';

export async function GET() {
  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // In a real implementation, we would fetch from the database
    // For the MVP, we're using mock data
    const summaries = getMockSummaries();

    return NextResponse.json({ summaries });
  } catch (error) {
    console.error('Error fetching summaries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch summaries' },
      { status: 500 }
    );
  }
} 