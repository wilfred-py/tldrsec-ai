"use strict";
/**
 * SEC Filing Parsers
 *
 * This module exports all the parsers and utilities needed to parse SEC filings.
 * It initializes the filing type registry and makes the parsers available.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.filingTypes = void 0;
exports.initializeParsers = initializeParsers;
// Initialize the filing type registry
require("./filing-types");
// Re-export parsers and utilities
__exportStar(require("./html-parser"), exports);
__exportStar(require("./sec-filing-parser"), exports);
__exportStar(require("./filing-parser-factory"), exports);
__exportStar(require("./filing-type-registry"), exports);
// Export the individual filing types (for direct imports if needed)
exports.filingTypes = __importStar(require("./filing-types"));
// Initialize logging
const logging_1 = require("@/lib/logging");
const logger = new logging_1.Logger({}, 'parsers');
// Log successful initialization
logger.debug('SEC filing parsers initialized');
/**
 * Initialize parsers with any additional configuration
 * This is exposed for cases where explicit initialization is needed
 */
function initializeParsers() {
    // Import the filing type definitions (which registers them)
    // This is already done via the import above, but we're making it explicit here
    // for cases where programmatic initialization is needed
    require('./filing-types');
    logger.info('SEC filing parsers successfully initialized');
}
