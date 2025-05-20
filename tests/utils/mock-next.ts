import { NextResponse } from 'next/server';

/**
 * Mock NextResponse for testing
 */
export const mockNextResponse = {
  json: jest.fn().mockImplementation((data: any) => {
    return NextResponse.json(data);
  }),
  redirect: jest.fn().mockImplementation((url: string | URL) => {
    return NextResponse.redirect(url);
  }),
  next: jest.fn().mockImplementation(() => {
    return NextResponse.next();
  }),
  rewrite: jest.fn().mockImplementation((url: string | URL) => {
    return NextResponse.rewrite(url);
  })
}; 