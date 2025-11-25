import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    USE_3_PHASE_PIPELINE: process.env.USE_3_PHASE_PIPELINE || 'undefined',
    USE_3_PHASE_PIPELINE_type: typeof process.env.USE_3_PHASE_PIPELINE,
    USE_3_PHASE_PIPELINE_strict_check: process.env.USE_3_PHASE_PIPELINE === 'true',
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV || 'undefined',
    all_env_keys_containing_3phase: Object.keys(process.env).filter(k => k.includes('3PHASE') || k.includes('3_PHASE')),
    timestamp: new Date().toISOString()
  });
}
