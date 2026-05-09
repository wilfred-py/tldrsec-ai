import { NextResponse } from 'next/server';

/**
 * GET /api/cron/prompt-improvement
 * Analyzes negative email feedback to generate prompt improvement recommendations.
 * Runs weekly (Sunday, piggybacked on daily cron via CF Worker).
 */
export async function GET(request: Request) {
  // Validate HMAC auth
  try {
    const { CronAuthService } = await import('@/lib/cron/auth-service');
    const authResult = CronAuthService.validateCronRequest(request);
    if (!authResult.isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Auth validation failed' }, { status: 401 });
  }

  try {
    const { getPrismaClient } = await import('@/lib/db/prisma');
    const prisma = getPrismaClient();

    // Query negative feedback from past 7 days
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const negativeFeedback = await prisma.emailFeedback.findMany({
      where: {
        vote: 'down',
        createdAt: { gte: oneWeekAgo },
      },
      include: {
        summary: {
          select: {
            filingType: true,
            summaryText: true,
            summaryJSON: true,
            importance: true,
          },
        },
      },
      take: 100,
    });

    if (negativeFeedback.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No negative feedback this week',
        recommendations: [],
      });
    }

    // Cluster by filing type
    const clusters: Record<string, Array<{ summaryText: string; importance: string | null }>> = {};
    for (const fb of negativeFeedback) {
      const type = fb.summary.filingType;
      if (!clusters[type]) clusters[type] = [];
      clusters[type].push({
        summaryText: fb.summary.summaryText.slice(0, 500),
        importance: fb.summary.importance,
      });
    }

    // Only analyze clusters with 2+ negative votes
    const significantClusters = Object.entries(clusters).filter(([, items]) => items.length >= 2);

    if (significantClusters.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No significant feedback patterns detected',
        totalNegative: negativeFeedback.length,
        recommendations: [],
      });
    }

    // Call Grok for analysis
    const recommendations: Array<{ filingType: string; count: number; analysis: string }> = [];

    for (const [filingType, samples] of significantClusters) {
      try {
        const model = process.env.DEFAULT_AI_MODEL || 'x-ai/grok-4.3';
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: 'You are an AI quality analyst reviewing SEC filing summaries that received negative feedback from users. Identify specific quality issues and suggest concrete prompt improvements. Be concise — max 3 bullet points per filing type.',
              },
              {
                role: 'user',
                content: `These ${filingType} summaries received negative feedback (${samples.length} downvotes this week):\n\n${samples.map((s, i) => `Sample ${i + 1} (importance: ${s.importance || 'unknown'}):\n${s.summaryText}`).join('\n\n---\n\n')}\n\nWhat specific quality issues do you see? What prompt changes would improve these?`,
              },
            ],
            max_tokens: 500,
            temperature: 0.3,
          }),
        });

        if (response.ok) {
          const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
          const analysis = data.choices?.[0]?.message?.content || 'Analysis unavailable';
          recommendations.push({ filingType, count: samples.length, analysis });
        }
      } catch {
        recommendations.push({ filingType, count: samples.length, analysis: 'AI analysis failed' });
      }
    }

    return NextResponse.json({
      success: true,
      totalNegative: negativeFeedback.length,
      clustersAnalyzed: significantClusters.length,
      recommendations,
    });
  } catch (error) {
    console.error('[prompt-improvement] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
