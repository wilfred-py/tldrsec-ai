'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';

/**
 * Update the tutorial progress for the current user
 * 
 * @param progress Progress percentage (0-100)
 * @param tutorialData Additional tutorial data to store
 * @returns Success status and any error information
 */
export async function updateTutorialProgress(
  progress: number,
  tutorialData: {
    currentStep: number;
    currentSubstep: number;
    completed: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }
    
    // Get user from database
    const user = await prisma.user.findFirst({
      where: { 
        authProviderId: userId 
      }
    });
    
    if (!user) {
      return { success: false, error: 'User not found in database' };
    }
    
    // Update the user's tutorial progress
    await prisma.user.update({
      where: { id: user.id },
      data: {
        tutorialProgress: progress,
        tutorialCompletedAt: tutorialData.completed ? new Date() : undefined,
        tutorialSteps: tutorialData
      }
    });
    
    // Revalidate the dashboard
    revalidatePath('/dashboard');
    
    return { success: true };
  } catch (error) {
    console.error('Failed to update tutorial progress:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update tutorial progress' 
    };
  }
}

/**
 * Get the onboarding and tutorial status for the current user
 * 
 * @returns Onboarding and tutorial status information
 */
export async function getUserOnboardingStatus(): Promise<{
  success: boolean;
  error?: string;
  onboardingCompleted?: boolean;
  tutorialCompleted?: boolean;
  tutorialProgress?: number;
  tutorialSteps?: any;
}> {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }
    
    // Get user from database
    const user = await prisma.user.findFirst({
      where: { 
        authProviderId: userId 
      }
    });
    
    if (!user) {
      return { success: false, error: 'User not found in database' };
    }
    
    return {
      success: true,
      onboardingCompleted: user.onboardingCompleted,
      tutorialCompleted: user.tutorialCompletedAt !== null,
      tutorialProgress: user.tutorialProgress,
      tutorialSteps: user.tutorialSteps
    };
  } catch (error) {
    console.error('Failed to get user onboarding status:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get user onboarding status' 
    };
  }
} 