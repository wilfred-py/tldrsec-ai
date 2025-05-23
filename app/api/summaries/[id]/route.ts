import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { getMockSummaries } from '@/lib/api/summary-service';

interface Params {
  id: string;
}

export async function GET(
  req: Request,
  { params }: { params: Params }
) {
  try {
    const id = params.id;
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
    const summary = summaries.find(s => s.id === id);

    if (!summary) {
      return NextResponse.json(
        { error: 'Summary not found' },
        { status: 404 }
      );
    }

    // Check if user has access to this summary (owns the ticker)
    if (summary.ticker.userId !== user.id) {
      return NextResponse.json(
        { error: 'Not authorized to view this summary' },
        { status: 403 }
      );
    }

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Error fetching summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch summary' },
      { status: 500 }
    );
  }
} 