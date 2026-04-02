import { AccessDeniedError, ResourceNotFoundError } from '@/lib/auth/access-control';

describe('Access Control Error Types', () => {
  it('should create AccessDeniedError with correct name', () => {
    const error = new AccessDeniedError('test message');
    expect(error.name).toBe('AccessDeniedError');
    expect(error.message).toBe('test message');
    expect(error).toBeInstanceOf(Error);
  });

  it('should create ResourceNotFoundError with correct name', () => {
    const error = new ResourceNotFoundError('test message');
    expect(error.name).toBe('ResourceNotFoundError');
    expect(error.message).toBe('test message');
    expect(error).toBeInstanceOf(Error);
  });
});
