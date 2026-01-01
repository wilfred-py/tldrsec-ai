import { NextRequest } from 'next/server';
import { POST, DELETE, GET, _resetSimulationForTesting } from '@/app/api/admin/simulate-stall/route';

// Mock Prisma
const mockCreate = jest.fn();
const mockDeleteMany = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => ({
    jobLock: {
      create: mockCreate,
      deleteMany: mockDeleteMany,
    },
  })),
}));

// Helper to set NODE_ENV (avoids TypeScript read-only error)
function setNodeEnv(env: string): void {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: env,
    writable: true,
    configurable: true,
  });
}

describe('/api/admin/simulate-stall', () => {
  const validSecret = 'test-admin-secret';

  beforeEach(() => {
    process.env.ADMIN_API_SECRET = validSecret;
    setNodeEnv('development'); // Only works in dev/test
    jest.clearAllMocks();
    mockCreate.mockReset();
    mockDeleteMany.mockReset();
    _resetSimulationForTesting();
  });

  afterEach(() => {
    delete process.env.ADMIN_API_SECRET;
    setNodeEnv('test');
  });

  describe('Authentication', () => {
    it('should reject requests without authorization header', async () => {
      const request = new NextRequest('http://localhost/api/admin/simulate-stall', {
        method: 'POST',
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid secret', async () => {
      const request = new NextRequest('http://localhost/api/admin/simulate-stall', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer wrong-secret' },
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });
  });

  describe('Environment Protection', () => {
    it('should reject requests in production environment', async () => {
      setNodeEnv('production');

      const request = new NextRequest('http://localhost/api/admin/simulate-stall', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
      const body = await response.json() as { error: string };
      expect(body.error).toContain('production');
    });

    it('should allow requests in development environment', async () => {
      setNodeEnv('development');
      mockCreate.mockResolvedValue({ id: 'lock-1' });

      const request = new NextRequest('http://localhost/api/admin/simulate-stall', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
        body: JSON.stringify({ staleLocks: 1 }),
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should allow requests in test environment', async () => {
      setNodeEnv('test');
      mockCreate.mockResolvedValue({ id: 'lock-1' });

      const request = new NextRequest('http://localhost/api/admin/simulate-stall', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
        body: JSON.stringify({ staleLocks: 1 }),
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Stall Simulation', () => {
    it('should create stale locks when POST is called', async () => {
      mockCreate
        .mockResolvedValueOnce({ id: 'lock-1' })
        .mockResolvedValueOnce({ id: 'lock-2' })
        .mockResolvedValueOnce({ id: 'lock-3' })
        .mockResolvedValueOnce({ id: 'lock-4' })
        .mockResolvedValueOnce({ id: 'lock-5' });

      const request = new NextRequest('http://localhost/api/admin/simulate-stall', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
        body: JSON.stringify({ staleLocks: 5, stallMinutes: 120 }),
      });
      const response = await POST(request);
      const body = await response.json() as {
        success: boolean;
        simulation: { staleLocks: number; stallMinutes: number; lockIds: string[] };
      };

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.simulation.staleLocks).toBe(5);
      expect(body.simulation.stallMinutes).toBe(120);
      expect(body.simulation.lockIds).toHaveLength(5);
      expect(mockCreate).toHaveBeenCalledTimes(5);
    });

    it('should use default values when body is empty', async () => {
      mockCreate
        .mockResolvedValueOnce({ id: 'lock-1' })
        .mockResolvedValueOnce({ id: 'lock-2' })
        .mockResolvedValueOnce({ id: 'lock-3' });

      const request = new NextRequest('http://localhost/api/admin/simulate-stall', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await POST(request);
      const body = await response.json() as {
        simulation: { staleLocks: number; stallMinutes: number };
      };

      expect(response.status).toBe(200);
      expect(body.simulation.staleLocks).toBe(3); // default
      expect(body.simulation.stallMinutes).toBe(150); // default
    });

    it('should clear simulated stall when DELETE is called', async () => {
      // First create a simulation
      mockCreate.mockResolvedValue({ id: 'lock-1' });
      const createRequest = new NextRequest('http://localhost/api/admin/simulate-stall', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
        body: JSON.stringify({ staleLocks: 1 }),
      });
      await POST(createRequest);

      // Then delete it
      mockDeleteMany.mockResolvedValue({ count: 1 });

      const request = new NextRequest('http://localhost/api/admin/simulate-stall', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await DELETE(request);
      const body = await response.json() as { success: boolean; cleared: boolean };

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.cleared).toBe(true);
    });

    it('should return current simulation state on GET', async () => {
      // First create a simulation
      mockCreate
        .mockResolvedValueOnce({ id: 'lock-1' })
        .mockResolvedValueOnce({ id: 'lock-2' });

      const createRequest = new NextRequest('http://localhost/api/admin/simulate-stall', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validSecret}` },
        body: JSON.stringify({ staleLocks: 2 }),
      });
      await POST(createRequest);

      // Then check state
      const request = new NextRequest('http://localhost/api/admin/simulate-stall', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await GET(request);
      const body = await response.json() as {
        active: boolean;
        simulation: { staleLocks: number; lockIds: string[] } | null;
      };

      expect(response.status).toBe(200);
      expect(body.active).toBe(true);
      expect(body.simulation?.staleLocks).toBe(2);
      expect(body.simulation?.lockIds).toHaveLength(2);
    });

    it('should return inactive state when no simulation exists', async () => {
      const request = new NextRequest('http://localhost/api/admin/simulate-stall', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${validSecret}` },
      });
      const response = await GET(request);
      const body = await response.json() as { active: boolean; simulation: null };

      expect(response.status).toBe(200);
      expect(body.active).toBe(false);
      expect(body.simulation).toBeNull();
    });
  });
});
