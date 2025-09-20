import { NextResponse } from 'next/server';

/**
 * Build-time environment validation health check
 * Validates that build-time safety mechanisms are working properly
 */

interface BuildEnvironmentValidation {
  buildTimeDetected: boolean;
  environmentVariablesValidated: boolean;
  dynamicImportsAvailable: boolean;
  placeholderHandlingActive: boolean;
}

/**
 * Detect if we're in a build environment where environment variables may not be available
 */
function isBuildTime(): boolean {
  return process.env.NODE_ENV === 'production' && !process.env.VERCEL && !process.env.ANTHROPIC_API_KEY;
}

/**
 * Validate build environment configuration
 */
function validateBuildEnvironment(): BuildEnvironmentValidation {
  const validation: BuildEnvironmentValidation = {
    buildTimeDetected: isBuildTime(),
    environmentVariablesValidated: false,
    dynamicImportsAvailable: false,
    placeholderHandlingActive: false
  };

  // Check environment variable validation
  if (isBuildTime()) {
    validation.placeholderHandlingActive = true;
    validation.environmentVariablesValidated = true;
  } else {
    // In runtime, ensure critical environment variables are present
    const requiredSecrets = ['CRON_SECRET', 'ANTHROPIC_API_KEY', 'RESEND_API_KEY'];
    const missingSecrets = requiredSecrets.filter(key => !process.env[key]);
    validation.environmentVariablesValidated = missingSecrets.length === 0;
  }

  // Dynamic imports are always available in modern Node.js
  validation.dynamicImportsAvailable = true;

  return validation;
}

export async function GET() {
  try {
    const validation = validateBuildEnvironment();
    
    // Test dynamic import to ensure it works
    try {
      await import('../../../../lib/logging');
      validation.dynamicImportsAvailable = true;
    } catch (_error) {
      validation.dynamicImportsAvailable = false;
    }

    const isHealthy = validation.environmentVariablesValidated && validation.dynamicImportsAvailable;

    return NextResponse.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      buildTimeSupport: true,
      validation,
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        vercel: !!process.env.VERCEL,
        buildTime: validation.buildTimeDetected
      }
    }, { 
      status: isHealthy ? 200 : 500 
    });
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      buildTimeSupport: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}