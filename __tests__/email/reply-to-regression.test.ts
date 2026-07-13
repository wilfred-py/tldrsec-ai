/**
 * Reply-to regression test.
 *
 * The onboarding welcome email previously fell through to
 * resendConfig.defaultReplyTo = 'no-reply@tldrsec.app', which silently dropped
 * every user reply. This test locks in two invariants:
 *
 *   1. The config default falls back to 'wilf@tldrsec.app' (not 'no-reply').
 *      Env override (EMAIL_DEFAULT_REPLY_TO) still works for staging.
 *
 *   2. queueWelcomeEmail (the welcome-service code path) sets replyTo
 *      EXPLICITLY on the EmailMessage, so a future config rollback can't
 *      silently re-break replies. Belt-and-braces.
 *
 * The source-grep style is intentional: it catches the specific regression
 * pattern (sending without explicit replyTo) without booting prisma/clerk/resend.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('reply-to regression', () => {
  describe('lib/email/config.ts', () => {
    it('resendConfig.defaultReplyTo falls back to wilf@tldrsec.app when env is unset', () => {
      const prev = process.env.EMAIL_DEFAULT_REPLY_TO;
      delete process.env.EMAIL_DEFAULT_REPLY_TO;
      jest.resetModules();
      const { resendConfig } = require('@/lib/email/config');
      try {
        expect(resendConfig.defaultReplyTo).toBe('wilf@tldrsec.app');
      } finally {
        if (prev !== undefined) process.env.EMAIL_DEFAULT_REPLY_TO = prev;
      }
    });

    it('resendConfig.defaultReplyTo respects EMAIL_DEFAULT_REPLY_TO override', () => {
      const prev = process.env.EMAIL_DEFAULT_REPLY_TO;
      process.env.EMAIL_DEFAULT_REPLY_TO = 'staging@example.com';
      jest.resetModules();
      const { resendConfig } = require('@/lib/email/config');
      try {
        expect(resendConfig.defaultReplyTo).toBe('staging@example.com');
      } finally {
        if (prev === undefined) delete process.env.EMAIL_DEFAULT_REPLY_TO;
        else process.env.EMAIL_DEFAULT_REPLY_TO = prev;
      }
    });
  });

  describe('lib/email/welcome-service.ts', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'lib/email/welcome-service.ts'),
      'utf-8'
    );

    // Match either the literal "wilf@tldrsec.app" or the FOUNDER_REPLY_TO constant.
    // The constant lives in lib/email/config.ts; either is acceptable as long as
    // queueWelcomeEmail sets replyTo to something other than no-reply@.
    const REPLY_TO_PATTERN = /replyTo:\s*(FOUNDER_REPLY_TO|['"]wilf@tldrsec\.app['"])/;

    it('queueWelcomeEmail sets an explicit replyTo on the EmailMessage', () => {
      const queueFnIdx = source.indexOf('export async function queueWelcomeEmail');
      expect(queueFnIdx).toBeGreaterThan(-1);
      const queueBody = source.slice(queueFnIdx);
      expect(queueBody).toMatch(REPLY_TO_PATTERN);
    });

    it('contains no remaining no-reply@ literal in welcome-service', () => {
      // Sanity check that earlier no-reply default isn't accidentally hard-coded.
      expect(source).not.toMatch(/no-reply@tldrsec/);
    });
  });
});
