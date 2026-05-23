/**
 * Email notification preference enum.
 *
 * Defines the user-facing email-frequency setting persisted on
 * `User.preferences.notifications.emailFrequency` (see
 * `lib/user/preference-types.ts`). Consumed by the onboarding flow,
 * the settings form, and any future delivery cadence module.
 */

export enum NotificationPreference {
  IMMEDIATE = 'immediate',
  DAILY = 'daily',
  NONE = 'none',
}
