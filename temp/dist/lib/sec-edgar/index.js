"use strict";
/**
 * SEC EDGAR API Client
 *
 * This module provides tools for interacting with the SEC EDGAR API,
 * including filing retrieval, parsing, and storage.
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilingStorage = exports.SECEdgarClient = void 0;
// Export filing types
__exportStar(require("./types"), exports);
// Export filing parsers
__exportStar(require("./parsers"), exports);
// Export the primary SEC EDGAR client
var client_1 = require("./client");
Object.defineProperty(exports, "SECEdgarClient", { enumerable: true, get: function () { return client_1.SECEdgarClient; } });
// Export ticker service
__exportStar(require("./ticker-service"), exports);
// Export filing storage functionality
var filing_storage_1 = require("./filing-storage");
Object.defineProperty(exports, "FilingStorage", { enumerable: true, get: function () { return filing_storage_1.FilingStorage; } });
