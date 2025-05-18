"use strict";
/**
 * Types for SEC EDGAR API integration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SECEdgarError = exports.SECErrorCode = void 0;
// Error codes for SEC Edgar API
var SECErrorCode;
(function (SECErrorCode) {
    SECErrorCode["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    SECErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
    SECErrorCode["TIMEOUT"] = "TIMEOUT";
    SECErrorCode["NOT_FOUND"] = "NOT_FOUND";
    SECErrorCode["PARSING_ERROR"] = "PARSING_ERROR";
    SECErrorCode["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(SECErrorCode || (exports.SECErrorCode = SECErrorCode = {}));
// Custom error class for SEC Edgar API
class SECEdgarError extends Error {
    constructor(message, code, status) {
        super(message);
        this.name = 'SECEdgarError';
        this.code = code;
        this.status = status;
    }
}
exports.SECEdgarError = SECEdgarError;
