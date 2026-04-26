export const EMAIL_NOTICE_PROMISE = (companyCount: number) =>
  `We'll email you when new filings are posted for ${companyCount} ${pluralize(companyCount, "company", "companies")}.`;

export const SETTINGS_HELPER = "Change anytime in Settings.";

export function pluralize(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}
