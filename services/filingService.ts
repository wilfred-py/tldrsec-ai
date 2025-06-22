/**
 * Filing Service
 * 
 * This file serves as a compatibility layer for the refactored filing service.
 * It re-exports all functionality from the modularized services/filing directory.
 */

// Re-export everything from the filing modules
export * from './filing/types';
export * from './filing/getFilingById';
export * from './filing/getFilingSummary';
export * from './filing/sendEmailSummary';
export * from './filing/utils';

/**
 * Mock implementation of getFilingLogs for backward compatibility
 * This should be implemented properly in a separate module
 */
const getFilingLogs = async () => {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 500));
  return { data: [] };
};

// Export a default object for backward compatibility with existing imports
import { getFilingById } from './filing/getFilingById';
import { getFilingSummary } from './filing/getFilingSummary';
import { sendEmailSummary } from './filing/sendEmailSummary';

export default {
  getFilingLogs,
  getFilingById,
  sendEmailSummary,
  getFilingSummary
};
