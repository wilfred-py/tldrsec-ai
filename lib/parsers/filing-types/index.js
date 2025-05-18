/**
 * Filing Types Index
 *
 * Exports all filing type definitions. This file serves as the single entry point
 * to load all supported filing types into the registry.
 */
// Import all filing type definitions
// This will execute the registration code in each module
import './10k';
import './10q';
import './8k';
import './form4';
import './defa14a';
import './sc13d';
import './form144';
// Re-export for convenience
export * from '../filing-type-registry';
// Export a function to initialize all filing types
// This isn't strictly necessary as imports above will register the types,
// but it provides a clear API for initialization
export function initializeFilingTypes() {
    // The imports above have already registered all types
    // This function exists mainly as a clear entry point for initialization
    console.log('SEC filing type registry initialized');
}
