# Authentication Testing Guide

This document explains the structure and approach for testing the authentication system in the tldrSEC application.

## Test Structure

The authentication tests are organized as follows:

```
__tests__/
├── mocks/
│   ├── clerk-mock.tsx        # Mock implementations of Clerk hooks
│   └── auth-provider-mock.tsx # Mock for AuthContext provider
├── lib/
│   └── context/
│       └── auth-context.test.tsx # Tests for AuthContext provider
├── components/
│   └── auth/
│       ├── auth-status.test.tsx       # Tests for AuthStatus component
│       ├── protected-route.test.tsx   # Tests for ProtectedRoute component
│       └── enhanced-sign-in-form.test.tsx  # Tests for sign-in form
└── app/
    └── (auth)/
        └── verify-email/
            └── page.test.tsx          # Tests for email verification page
```

## Mock Implementation

We use Jest's mocking capabilities to mock external dependencies:

1. **Clerk Authentication**: We mock all Clerk hooks (`useUser`, `useAuth`, `useSignIn`, `useSignUp`, `useClerk`) to simulate different authentication states without requiring actual authentication.

2. **AuthContext**: We provide a mock implementation of the AuthContext to allow testing components that rely on authentication state.

3. **Next.js Navigation**: We mock Next.js router and navigation functions to test redirect behavior.

4. **Toast Notifications**: We mock toast notifications to verify user feedback is correctly displayed.

## Test Utilities

The `test-utils.tsx` file provides enhanced render functions for testing:

```typescript
render(<Component />, {
  withAuth: true,                // Wrap with MockAuthProvider
  isAuthenticated: true,         // Set authentication state
  isLoading: false               // Set loading state
});
```

## Test Coverage

The authentication tests cover:

1. **AuthContext Provider**:
   - Authentication state management
   - Loading states
   - User information handling
   - Sign-out functionality

2. **ProtectedRoute Component**:
   - Rendering protected content for authenticated users
   - Redirecting unauthenticated users
   - Showing loading states
   - Custom redirect URLs
   - Custom loading fallbacks

3. **Auth Forms**:
   - Form rendering
   - Input validation
   - Error handling
   - Successful authentication
   - Redirection after authentication
   - Password visibility toggling
   - Verification code handling

4. **AuthStatus Component**:
   - Displaying authentication state
   - User information display
   - Sign-in/Sign-up/Sign-out button functionality

## Running Tests

To run all authentication tests:

```bash
npm test -- --testPathPattern=__tests__/(lib|components|app)/.*auth.*
```

To run a specific test file:

```bash
npm test -- __tests__/components/auth/protected-route.test.tsx
```

## Best Practices

1. Always reset mocks before each test using `jest.clearAllMocks()` in `beforeEach`.
2. Test all states: authenticated, unauthenticated, and loading.
3. Test success and error scenarios for all async operations.
4. Verify user feedback (toasts, error messages) is correctly displayed.
5. Test form validation thoroughly.

## Adding New Tests

When adding a new authentication-related component:

1. Create a test file following the existing structure.
2. Import and use the mock utilities from `__tests__/mocks/`.
3. Use the enhanced render function when the component uses authentication.
4. Test all relevant states and behaviors.
5. Add the new test to this documentation. 