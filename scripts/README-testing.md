# Testing Guide for tldrSEC

This guide covers the various testing utilities available in the project, including how to simulate user onboarding programmatically.

## Testing the Onboarding Flow

The onboarding flow can be tested programmatically using the `test-onboarding.ts` script. This is useful for:

- Testing changes to the onboarding workflow
- Setting up test users quickly
- Verifying database integration during onboarding
- Testing email functionality

### Prerequisites

Make sure you have the following environment variables set in your `.env` file:

```
# Required for user creation in Clerk
CLERK_SECRET_KEY=sk_test_XXXXXXXXXX

# Required for database access
DATABASE_URL="postgresql://username:password@localhost:5432/tldrsec?schema=public"
```

### Running the Onboarding Test

To run the default test, which creates a new test user with a random email:

```bash
npm run test:onboarding
```

### Command Line Options

The script supports several command line options:

- `--email=<email>`: Specify a custom email address to use for testing
- `--cleanup`: Delete the test user after testing (both from the database and Clerk)
- `--skip-clerk`: Skip Clerk user creation (use this if you already have a test user)

### Examples

Test with a specific email:
```bash
npm run test:onboarding -- --email=test@example.com
```

Create a test user and then clean it up afterward:
```bash
npm run test:onboarding -- --cleanup
```

Use an existing user (skips Clerk creation):
```bash
npm run test:onboarding -- --email=existing@example.com --skip-clerk
```

### What the Test Does

The test script simulates a user going through the complete onboarding flow by:

1. Creating a test user in Clerk (if not skipped)
2. Saving user preferences (normally done in the onboarding UI)
3. Adding some ticker subscriptions (AAPL, MSFT, GOOGL)
4. Marking the onboarding as complete
5. Verifying the results in the database

This bypasses the UI entirely by directly calling the same database operations that would be performed during onboarding.

## Other Testing Utilities

The project includes several other testing utilities:

- `npm test`: Run all Jest tests
- `npm run test:watch`: Run tests in watch mode
- `npm run test:esm`: Run tests with ESM modules
- Various specific test scripts for parsers, PDF extraction, etc.

## Adding New Test Users Manually

If you need to manually add a test user:

1. Sign up at `/sign-up` with your test email
2. Complete the onboarding process
3. You can then sign in with this user at `/sign-in` 