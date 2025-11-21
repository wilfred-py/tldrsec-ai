import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkJobQueue() {
  try {
    console.log('Checking JobQueue for ASYNC_SUMMARIZE_FILING jobs...\n');

    const jobs = await prisma.jobQueue.findMany({
      where: {
        jobType: 'ASYNC_SUMMARIZE_FILING',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    console.log(`Found ${jobs.length} ASYNC_SUMMARIZE_FILING jobs\n`);

    if (jobs.length > 0) {
      console.log('Most recent jobs:');
      jobs.forEach((job, index) => {
        console.log(`\n${index + 1}. Job ID: ${job.id}`);
        console.log(`   Status: ${job.status}`);
        console.log(`   Priority: ${job.priority}`);
        console.log(`   Created: ${job.createdAt.toISOString()}`);
        console.log(`   Attempts: ${job.attempts}/${job.maxAttempts}`);
      });
    } else {
      console.log('❌ No ASYNC_SUMMARIZE_FILING jobs found in the queue');
    }

  } catch (error) {
    console.error('Error checking job queue:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkJobQueue();
