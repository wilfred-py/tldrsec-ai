/**
 * Types for SEC EDGAR API integration
 */
// Error codes for SEC Edgar API
export var SECErrorCode;
(function (SECErrorCode) {
    SECErrorCode["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    SECErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
    SECErrorCode["TIMEOUT"] = "TIMEOUT";
    SECErrorCode["NOT_FOUND"] = "NOT_FOUND";
    SECErrorCode["PARSING_ERROR"] = "PARSING_ERROR";
    SECErrorCode["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(SECErrorCode || (SECErrorCode = {}));
// Custom error class for SEC Edgar API
export class SECEdgarError extends Error {
    constructor(message, code, status) {
        super(message);
        this.name = 'SECEdgarError';
        this.code = code;
        this.status = status;
    }
}
