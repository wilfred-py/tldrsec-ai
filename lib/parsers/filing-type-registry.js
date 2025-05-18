/**
 * Filing Type Registry
 *
 * Provides a centralized registry for SEC filing types and their configuration.
 * This allows for a more extensible and maintainable approach to handling
 * different SEC filing types.
 */
/**
 * Registry for SEC filing types and their configurations
 */
export class FilingTypeRegistry {
    /**
     * Register a new filing type with its section configuration
     *
     * @param type Filing type identifier (e.g., '10-K', 'DEF 14A')
     * @param config Configuration for this filing type
     */
    static register(type, config) {
        this.registry.set(type, config);
    }
    /**
     * Check if a filing type is supported by the registry
     *
     * @param type Filing type to check
     * @returns True if the filing type is registered
     */
    static isSupported(type) {
        return this.registry.has(type);
    }
    /**
     * Get the section configuration for a filing type
     *
     * @param type Filing type to lookup
     * @returns Configuration for the filing type or undefined if not supported
     */
    static getSectionConfig(type) {
        return this.registry.get(type);
    }
    /**
     * Get important sections for a filing type
     *
     * @param type Filing type to lookup
     * @returns Array of important section names or empty array if not supported
     */
    static getImportantSections(type) {
        var _a;
        return ((_a = this.registry.get(type)) === null || _a === void 0 ? void 0 : _a.importantSections) || [];
    }
    /**
     * Get all supported filing types
     *
     * @returns Array of all registered filing type identifiers
     */
    static getAllTypes() {
        return Array.from(this.registry.keys());
    }
    /**
     * Get a map of all filing types and their descriptions
     *
     * @returns Map of filing types to their descriptions
     */
    static getFilingTypeDescriptions() {
        const descriptions = new Map();
        this.registry.forEach((config, type) => {
            descriptions.set(type, config.description || `${type} SEC Filing`);
        });
        return descriptions;
    }
}
/** Internal registry mapping filing types to their configurations */
FilingTypeRegistry.registry = new Map();
