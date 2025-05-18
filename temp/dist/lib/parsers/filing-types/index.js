"use strict";
/**
 * Filing Types Index
 *
 * Exports all filing type definitions. This file serves as the single entry point
 * to load all supported filing types into the registry.
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
exports.initializeFilingTypes = initializeFilingTypes;
// Import all filing type definitions
// This will execute the registration code in each module
require("./10k");
require("./10q");
require("./8k");
require("./form4");
require("./defa14a");
require("./sc13d");
require("./form144");
// Re-export for convenience
__exportStar(require("../filing-type-registry"), exports);
// Export a function to initialize all filing types
// This isn't strictly necessary as imports above will register the types,
// but it provides a clear API for initialization
function initializeFilingTypes() {
    // The imports above have already registered all types
    // This function exists mainly as a clear entry point for initialization
    console.log('SEC filing type registry initialized');
}
