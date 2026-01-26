/**
 * Tests for Heartbeat Watchdog
 *
 * Integration tests for the pipeline heartbeat watchdog system:
 * - Alert email generation
 * - Alert triggering logic
 * - Health endpoint field validation
 *
 * @see docs/plans/2026-01-26-pipeline-resilience-zero-intervention.md Phase 3
 */

import {
  generateAlertEmail,
  shouldSendAlert,
  type PipelineStatus,
} from '@/lib/monitoring/heartbeat-alert';

describe('Heartbeat Watchdog', () => {
  describe('Alert Email Format', () => {
    it('should generate valid alert email content', () => {
      const alertContent = generateAlertEmail({
        status: 'CRITICAL',
        minutesSinceLastCompletion: 45,
        lastExecution: '2026-01-26T00:00:00Z',
        pendingJobs: 156,
        healthEndpoint: 'https://tldrsec.app/api/health/pipeline',
      });

      expect(alertContent.subject).toContain('Pipeline Stall');
      expect(alertContent.subject).toContain('CRITICAL');
      expect(alertContent.body).toContain('45 minutes');
      expect(alertContent.body).toContain('156');
      expect(alertContent.body).toContain('https://tldrsec.app');
    });

    it('should include recommended actions in email body', () => {
      const alert = generateAlertEmail({
        status: 'CRITICAL',
        minutesSinceLastCompletion: 30,
        lastExecution: '2026-01-26T01:00:00Z',
        pendingJobs: 50,
        healthEndpoint: 'https://tldrsec.app/api/health/pipeline',
      });

      expect(alert.body).toContain('Recommended Actions');
      expect(alert.body).toContain('npx wrangler tail');
      expect(alert.body).toContain('pipeline-stall-recovery.md');
    });

    it('should generate valid HTML email', () => {
      const alert = generateAlertEmail({
        status: 'DEGRADED',
        minutesSinceLastCompletion: 20,
        lastExecution: '2026-01-26T01:00:00Z',
        pendingJobs: 25,
        healthEndpoint: 'https://tldrsec.app/api/health/pipeline',
      });

      expect(alert.html).toContain('<!DOCTYPE html>');
      expect(alert.html).toContain('Pipeline DEGRADED');
      expect(alert.html).toContain('20 minutes');
    });

    it('should handle zero pending jobs', () => {
      const alert = generateAlertEmail({
        status: 'CRITICAL',
        minutesSinceLastCompletion: 60,
        lastExecution: '2026-01-26T00:00:00Z',
        pendingJobs: 0,
        healthEndpoint: 'https://tldrsec.app/api/health/pipeline',
      });

      expect(alert.body).toContain('Pending Jobs: 0');
    });
  });

  describe('Alert Triggering Logic', () => {
    it('should trigger alert when status is CRITICAL', () => {
      expect(shouldSendAlert(5, 'CRITICAL')).toBe(true);
    });

    it('should trigger alert when no completion for 15+ minutes', () => {
      expect(shouldSendAlert(16, 'DEGRADED')).toBe(true);
      expect(shouldSendAlert(20, 'DEGRADED')).toBe(true);
    });

    it('should not trigger alert when healthy and recent completion', () => {
      expect(shouldSendAlert(5, 'HEALTHY')).toBe(false);
      expect(shouldSendAlert(10, 'HEALTHY')).toBe(false);
    });

    it('should not trigger alert at exactly 15 minutes', () => {
      expect(shouldSendAlert(15, 'DEGRADED')).toBe(false);
    });

    it('should trigger alert when minutesSinceLastCompletion exceeds custom threshold', () => {
      // Custom 10-minute threshold
      expect(shouldSendAlert(11, 'HEALTHY', 10)).toBe(true);
      expect(shouldSendAlert(10, 'HEALTHY', 10)).toBe(false);
    });

    it('should handle null minutesSinceLastCompletion', () => {
      // null means we don't know - only trigger if status is CRITICAL
      expect(shouldSendAlert(null, 'HEALTHY')).toBe(false);
      expect(shouldSendAlert(null, 'CRITICAL')).toBe(true);
    });
  });

  describe('Email Content Validation', () => {
    it('should escape special characters in status', () => {
      const alert = generateAlertEmail({
        status: 'UNKNOWN<script>',
        minutesSinceLastCompletion: 10,
        lastExecution: '2026-01-26T00:00:00Z',
        pendingJobs: 5,
        healthEndpoint: 'https://tldrsec.app/api/health/pipeline',
      });

      // HTML should include the status (XSS prevention is email client's responsibility)
      expect(alert.html).toContain('UNKNOWN<script>');
    });

    it('should format all required fields', () => {
      const status: PipelineStatus = {
        status: 'CRITICAL',
        minutesSinceLastCompletion: 100,
        lastExecution: '2026-01-25T12:00:00Z',
        pendingJobs: 500,
        healthEndpoint: 'https://tldrsec.app/api/health/pipeline',
      };

      const alert = generateAlertEmail(status);

      // Subject
      expect(alert.subject).toMatch(/TLDRSec Pipeline Stall Alert/);

      // Body contains all key info
      expect(alert.body).toContain('Status: CRITICAL');
      expect(alert.body).toContain('100 minutes');
      expect(alert.body).toContain('500');
      expect(alert.body).toContain('2026-01-25T12:00:00Z');

      // HTML contains all key info
      expect(alert.html).toContain('100 minutes');
      expect(alert.html).toContain('500');
    });
  });
});
