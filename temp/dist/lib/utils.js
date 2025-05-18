"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cn = cn;
exports.sleep = sleep;
const clsx_1 = require("clsx");
const tailwind_merge_1 = require("tailwind-merge");
function cn(...inputs) {
    return (0, tailwind_merge_1.twMerge)((0, clsx_1.clsx)(inputs));
}
/**
 * Utility functions for the application
 */
/**
 * Sleep for the specified number of milliseconds
 * @param ms Number of milliseconds to sleep
 * @returns Promise that resolves after the specified time
 */
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
