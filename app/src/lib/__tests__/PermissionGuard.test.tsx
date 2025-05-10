import { render, screen } from '@testing-library/react';
import PermissionGuard from '@/components/auth/PermissionGuard';
import { useAuth } from '@/hooks/useAuth';
import { Permission, UserRole } from '@/lib/permissions';
import '@testing-library/jest-dom';

// Mock useAuth hook
jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

describe('PermissionGuard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render children when no permissions or roles required', () => {
    // Mock auth hook to return an authenticated user
    (useAuth as unknown as jest.Mock).mockReturnValue({
      user: {
        userId: 'user_123',
        userEmail: 'user@example.com',
        role: 'user',
      },
      isLoading: false,
    });

    render(
      <PermissionGuard>
        <div data-testid="protected-content">Protected Content</div>
      </PermissionGuard>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('should render fallback when user is not authenticated', () => {
    // Mock auth hook to return no user
    (useAuth as unknown as jest.Mock).mockReturnValue({
      user: null,
      isLoading: false,
    });

    render(
      <PermissionGuard fallback={<div data-testid="fallback-content">Access Denied</div>}>
        <div data-testid="protected-content">Protected Content</div>
      </PermissionGuard>
    );

    expect(screen.getByTestId('fallback-content')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('should show nothing while loading', () => {
    // Mock auth hook to return loading state
    (useAuth as unknown as jest.Mock).mockReturnValue({
      user: null,
      isLoading: true,
    });

    render(
      <PermissionGuard fallback={<div data-testid="fallback-content">Access Denied</div>}>
        <div data-testid="protected-content">Protected Content</div>
      </PermissionGuard>
    );

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fallback-content')).not.toBeInTheDocument();
  });

  it('should render children when user has required role', () => {
    // Mock auth hook to return an admin user
    (useAuth as unknown as jest.Mock).mockReturnValue({
      user: {
        userId: 'user_123',
        userEmail: 'admin@example.com',
        role: 'admin',
      },
      isLoading: false,
    });

    render(
      <PermissionGuard roles={[UserRole.ADMIN]}>
        <div data-testid="protected-content">Admin Content</div>
      </PermissionGuard>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('should render fallback when user lacks required role', () => {
    // Mock auth hook to return a regular user
    (useAuth as unknown as jest.Mock).mockReturnValue({
      user: {
        userId: 'user_123',
        userEmail: 'user@example.com',
        role: 'user',
      },
      isLoading: false,
    });

    render(
      <PermissionGuard 
        roles={[UserRole.ADMIN]} 
        fallback={<div data-testid="fallback-content">Admin Only</div>}
      >
        <div data-testid="protected-content">Admin Content</div>
      </PermissionGuard>
    );

    expect(screen.getByTestId('fallback-content')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('should render children when user has any required permission', () => {
    // Mock auth hook to return a user with specific permissions
    (useAuth as unknown as jest.Mock).mockReturnValue({
      user: {
        userId: 'user_123',
        userEmail: 'user@example.com',
        role: 'user',
      },
      isLoading: false,
    });

    render(
      <PermissionGuard 
        permissions={[Permission.VIEW_SUMMARIES, Permission.MANAGE_USERS]} 
        requireAllPermissions={false}
      >
        <div data-testid="protected-content">User Can View Summaries</div>
      </PermissionGuard>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('should render fallback when user lacks all required permissions', () => {
    // Mock auth hook to return a user with limited permissions
    (useAuth as unknown as jest.Mock).mockReturnValue({
      user: {
        userId: 'user_123',
        userEmail: 'user@example.com',
        role: 'user',
      },
      isLoading: false,
    });

    render(
      <PermissionGuard 
        permissions={[Permission.MANAGE_USERS, Permission.EDIT_ANY_CONTENT]} 
        requireAllPermissions={true}
        fallback={<div data-testid="fallback-content">Insufficient Permissions</div>}
      >
        <div data-testid="protected-content">Admin Content</div>
      </PermissionGuard>
    );

    expect(screen.getByTestId('fallback-content')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('should respect requireAuthenticated=false', () => {
    // Mock auth hook to return no user
    (useAuth as unknown as jest.Mock).mockReturnValue({
      user: null,
      isLoading: false,
    });

    render(
      <PermissionGuard requireAuthenticated={false}>
        <div data-testid="protected-content">Public Content</div>
      </PermissionGuard>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });
});