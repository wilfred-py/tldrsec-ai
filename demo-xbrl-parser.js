/**
 * Demo XBRL Parser for SEC Filings
 * 
 * This is a JavaScript version of the XBRL parser for demonstration purposes.
 */

const { XMLParser } = require('fast-xml-parser');

// Create a simple logger
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg, err) => console.error(`[ERROR] ${msg}`, err || ''),
  debug: (msg) => console.log(`[DEBUG] ${msg}`)
};

// XBRL namespaces commonly found in SEC filings
const XBRL_NAMESPACES = {
  XBRL: 'http://www.xbrl.org/2003/instance',
  XBRL21: 'http://www.xbrl.org/2003/instance',
  IX: 'http://www.xbrl.org/2013/inlineXBRL',
  IXBRL: 'http://www.xbrl.org/2008/inlineXBRL',
  XBRLI: 'http://www.xbrl.org/2003/instance',
  XBRLDI: 'http://xbrl.org/2006/xbrldi',
  US_GAAP: 'http://fasb.org/us-gaap/2021',
  DEI: 'http://xbrl.sec.gov/dei/2021',
};

// Filing section types
const FilingSectionType = {
  TITLE: 'title',
  HEADER: 'header',
  SECTION: 'section',
  PARAGRAPH: 'paragraph',
  TABLE: 'table',
  LIST: 'list'
};

// Default options for XBRL parsing
const DEFAULT_XBRL_OPTIONS = {
  extractContexts: true,
  extractUnits: true,
  extractFacts: true,
  ignoreAttributes: false,
  allowBooleanAttributes: true,
  parseTagValue: true,
  removeNSPrefix: true,
  isArray: (name) => ['context', 'unit', 'measure', 'segment', 'scenario', 'explicitMember'].includes(name),
};

// Standard financial metrics mapped to various taxonomy elements
const STANDARD_FINANCIAL_METRICS = {
  'Revenue': ['Revenue', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'TotalRevenuesAndOtherIncome'],
  'NetIncome': ['NetIncomeLoss', 'ProfitLoss', 'NetIncome', 'NetEarningsLoss'],
  'TotalAssets': ['Assets', 'AssetsCurrent', 'AssetsTotal'],
  'TotalLiabilities': ['Liabilities', 'LiabilitiesCurrent', 'LiabilitiesTotal'],
  'EPS': ['EarningsPerShareBasic', 'EarningsPerShareDiluted'],
  'OperatingIncome': ['OperatingIncomeLoss', 'GrossProfit', 'OperatingProfit'],
  'CashAndEquivalents': ['CashAndCashEquivalentsAtCarryingValue', 'Cash', 'CashEquivalentsAndShortTermInvestments'],
};

/**
 * Detects if content is XBRL
 * 
 * @param {string|Buffer} content - The content to check
 * @returns {boolean} True if content appears to be XBRL or inline XBRL
 */
function isXBRL(content) {
  const sample = Buffer.isBuffer(content) 
    ? content.slice(0, 1000).toString('utf8') 
    : content.substring(0, 1000);
  
  // Look for common XBRL indicators
  return (
    /<xbrl/i.test(sample) || 
    /<ix:header/i.test(sample) ||
    /xmlns:xbrli/i.test(sample) ||
    (/<html/i.test(sample) && /xmlns:ix/i.test(sample))
  );
}

/**
 * Parse XBRL from a string
 * 
 * @param {string} xbrlString - The XBRL string content
 * @param {Object} options - Parsing options
 * @returns {Object} A parsed XBRL document
 */
function parseXBRL(xbrlString, options = {}) {
  try {
    logger.debug('Parsing XBRL content');
    
    // Initialize parser options
    const parserOptions = {
      ...DEFAULT_XBRL_OPTIONS,
      ignoreAttributes: false,
      parseAttributeValue: true,
    };
    
    // Create XML parser
    const parser = new XMLParser(parserOptions);
    
    // Parse the XML
    const result = parser.parse(xbrlString);
    
    // Find the XBRL root element
    const xbrlRoot = findXBRLRoot(result);
    
    if (!xbrlRoot) {
      throw new Error('Could not find XBRL root element in the document');
    }
    
    // Initialize the parsed document
    const parsedDoc = {
      contexts: {},
      units: {},
      facts: [],
      standardizedMetrics: {},
      taxonomyNamespaces: extractNamespaces(xbrlString),
      documentInfo: extractDocumentInfo(xbrlRoot),
    };
    
    // Extract contexts
    if (options.extractContexts !== false) {
      parsedDoc.contexts = extractContexts(xbrlRoot);
    }
    
    // Extract units
    if (options.extractUnits !== false) {
      parsedDoc.units = extractUnits(xbrlRoot);
    }
    
    // Extract facts
    if (options.extractFacts !== false) {
      parsedDoc.facts = extractFacts(xbrlRoot, parsedDoc.taxonomyNamespaces);
    }
    
    // Standardize metrics
    if (options.standardizeMetrics !== false) {
      parsedDoc.standardizedMetrics = standardizeMetrics(parsedDoc.facts);
    }
    
    return parsedDoc;
  } catch (error) {
    logger.error('Error parsing XBRL:', error);
    throw new Error(`Failed to parse XBRL: ${error}`);
  }
}

/**
 * Parse XBRL from a buffer
 * 
 * @param {Buffer} buffer - The XBRL buffer content
 * @param {Object} options - Parsing options
 * @returns {Object} A parsed XBRL document
 */
function parseXBRLFromBuffer(buffer, options = {}) {
  return parseXBRL(buffer.toString('utf8'), options);
}

/**
 * Find the XBRL root element in the parsed object
 */
function findXBRLRoot(parsedObj) {
  // Check for direct XBRL format
  if (parsedObj.xbrl) {
    return parsedObj.xbrl;
  }
  
  // Check for inline XBRL format (HTML with embedded XBRL)
  if (parsedObj.html) {
    return parsedObj.html;
  }
  
  // Try to find it as a property at any level
  for (const key in parsedObj) {
    if (typeof parsedObj[key] === 'object' && parsedObj[key] !== null) {
      if (key === 'xbrl' || key === 'xbrli:xbrl') {
        return parsedObj[key];
      } else {
        const found = findXBRLRoot(parsedObj[key]);
        if (found) return found;
      }
    }
  }
  
  return null;
}

/**
 * Extract namespaces from the XBRL document
 */
function extractNamespaces(xbrlString) {
  const namespaces = {};
  
  // Extract xmlns declarations
  const xmlnsRegex = /xmlns:([^=]+)=["']([^"']+)["']/g;
  let match;
  
  while ((match = xmlnsRegex.exec(xbrlString)) !== null) {
    const [_, prefix, uri] = match;
    namespaces[prefix] = uri;
  }
  
  return namespaces;
}

/**
 * Extract document info from XBRL
 */
function extractDocumentInfo(xbrlRoot) {
  const info = {};
  
  // Look for common document info fields
  const infoFields = [
    { field: 'documentType', tags: ['dei:DocumentType', 'DocumentType'] },
    { field: 'companyName', tags: ['dei:EntityRegistrantName', 'EntityRegistrantName'] },
    { field: 'filingDate', tags: ['dei:DocumentPeriodEndDate', 'DocumentPeriodEndDate'] },
    { field: 'fiscalYear', tags: ['dei:DocumentFiscalYearFocus', 'DocumentFiscalYearFocus'] },
    { field: 'fiscalPeriod', tags: ['dei:DocumentFiscalPeriodFocus', 'DocumentFiscalPeriodFocus'] },
  ];
  
  for (const { field, tags } of infoFields) {
    for (const tag of tags) {
      if (xbrlRoot[tag]) {
        info[field] = xbrlRoot[tag];
        break;
      }
    }
  }
  
  return info;
}

/**
 * Extract contexts from the XBRL
 */
function extractContexts(xbrlRoot) {
  const contexts = {};
  
  // Try different possible context locations
  const contextArrays = [
    xbrlRoot.context,
    xbrlRoot['xbrli:context'],
    xbrlRoot['context'],
  ].filter(Boolean);
  
  // Process each context array
  for (const contextArray of contextArrays) {
    if (!Array.isArray(contextArray)) continue;
    
    for (const ctx of contextArray) {
      if (!ctx.id && !ctx['@_id']) continue;
      
      const id = ctx.id || ctx['@_id'];
      const context = { id };
      
      // Extract entity information
      if (ctx.entity || ctx['xbrli:entity']) {
        const entity = ctx.entity || ctx['xbrli:entity'];
        context.entity = { identifier: {} };
        
        if (entity.identifier || entity['xbrli:identifier']) {
          const identifier = entity.identifier || entity['xbrli:identifier'];
          context.entity.identifier = {
            scheme: identifier['@_scheme'],
            value: identifier['#text'] || identifier.__text || identifier.value,
          };
        }
        
        // Extract segment information if available
        if (entity.segment || entity['xbrli:segment']) {
          context.entity.segment = entity.segment || entity['xbrli:segment'];
        }
      }
      
      // Extract period information
      if (ctx.period || ctx['xbrli:period']) {
        const period = ctx.period || ctx['xbrli:period'];
        context.period = {};
        
        if (period.instant || period['xbrli:instant']) {
          context.period.instant = period.instant || period['xbrli:instant'];
        }
        
        if (period.startDate || period['xbrli:startDate']) {
          context.period.startDate = period.startDate || period['xbrli:startDate'];
        }
        
        if (period.endDate || period['xbrli:endDate']) {
          context.period.endDate = period.endDate || period['xbrli:endDate'];
        }
      }
      
      // Extract scenario information if available
      if (ctx.scenario || ctx['xbrli:scenario']) {
        context.scenario = ctx.scenario || ctx['xbrli:scenario'];
      }
      
      contexts[id] = context;
    }
  }
  
  return contexts;
}

/**
 * Extract units from the XBRL
 */
function extractUnits(xbrlRoot) {
  const units = {};
  
  // Try different possible unit locations
  const unitArrays = [
    xbrlRoot.unit,
    xbrlRoot['xbrli:unit'],
    xbrlRoot['unit'],
  ].filter(Boolean);
  
  // Process each unit array
  for (const unitArray of unitArrays) {
    if (!Array.isArray(unitArray)) continue;
    
    for (const unit of unitArray) {
      if (!unit.id && !unit['@_id']) continue;
      
      const id = unit.id || unit['@_id'];
      const unitObj = { id };
      
      // Extract measure information
      if (unit.measure || unit['xbrli:measure']) {
        unitObj.measure = unit.measure || unit['xbrli:measure'];
      }
      
      // Extract divide information
      if (unit.divide || unit['xbrli:divide']) {
        const divide = unit.divide || unit['xbrli:divide'];
        unitObj.divide = { numerator: {}, denominator: {} };
        
        if (divide.numerator || divide['xbrli:numerator']) {
          const numerator = divide.numerator || divide['xbrli:numerator'];
          unitObj.divide.numerator = {
            measure: numerator.measure || numerator['xbrli:measure'],
          };
        }
        
        if (divide.denominator || divide['xbrli:denominator']) {
          const denominator = divide.denominator || divide['xbrli:denominator'];
          unitObj.divide.denominator = {
            measure: denominator.measure || denominator['xbrli:measure'],
          };
        }
      }
      
      units[id] = unitObj;
    }
  }
  
  return units;
}

/**
 * Extract facts from the XBRL
 */
function extractFacts(xbrlRoot, namespaces) {
  const facts = [];
  
  // Process each property in the root
  for (const key in xbrlRoot) {
    // Skip non-fact elements and arrays
    if (key.startsWith('xbrli:') || key === 'context' || key === 'unit' || 
        key.startsWith('@_') || Array.isArray(xbrlRoot[key])) {
      continue;
    }
    
    // Extract namespace and concept name
    const parts = key.includes(':') ? key.split(':') : ['', key];
    const prefix = parts[0];
    const conceptName = parts[1] || key;
    
    // Get value
    const value = xbrlRoot[key];
    
    // Skip complex objects unless they look like facts
    if (typeof value === 'object' && value !== null && 
        !value['@_contextRef'] && !value.contextRef) {
      continue;
    }
    
    // For regular facts
    if (value && (value['@_contextRef'] || value.contextRef)) {
      const fact = {
        conceptName: conceptName || key,
        prefix,
        namespace: namespaces[prefix] || '',
        contextRef: value['@_contextRef'] || value.contextRef,
        value: value['#text'] || value.__text || value.value || value,
      };
      
      // Add unit reference if available
      if (value['@_unitRef'] || value.unitRef) {
        fact.unitRef = value['@_unitRef'] || value.unitRef;
      }
      
      // Add decimals if available
      if (value['@_decimals'] || value.decimals) {
        const decimals = value['@_decimals'] || value.decimals;
        fact.decimals = parseInt(decimals, 10);
      }
      
      facts.push(fact);
    }
  }
  
  return facts;
}

/**
 * Standardize metrics to common names
 */
function standardizeMetrics(facts) {
  const standardized = {};
  
  // For each standard metric, find matching facts
  for (const [standardName, possibleNames] of Object.entries(STANDARD_FINANCIAL_METRICS)) {
    standardized[standardName] = [];
    
    for (const fact of facts) {
      const conceptNameLower = fact.conceptName.toLowerCase();
      
      for (const possibleName of possibleNames) {
        if (conceptNameLower.includes(possibleName.toLowerCase())) {
          standardized[standardName].push(fact);
          break;
        }
      }
    }
  }
  
  return standardized;
}

/**
 * Parse XBRL from buffer and convert to SEC filing format
 * 
 * @param {Buffer} buffer - The XBRL content buffer
 * @param {Object} options - Parsing options
 * @returns {Promise<Object>} A parsed SEC filing
 */
async function parseXBRLAsSECFiling(buffer, options = {}) {
  try {
    logger.debug('Parsing XBRL as SEC filing');
    
    // Parse the XBRL
    const xbrlDoc = parseXBRLFromBuffer(buffer);
    
    // Create sections based on the XBRL document
    const sections = [];
    
    // Add metadata section
    sections.push({
      type: FilingSectionType.SECTION,
      title: 'Metadata',
      content: JSON.stringify(xbrlDoc.documentInfo, null, 2),
      metadata: xbrlDoc.documentInfo,
    });
    
    // Add a section for contexts
    if (Object.keys(xbrlDoc.contexts).length > 0) {
      sections.push({
        type: FilingSectionType.SECTION,
        title: 'Contexts',
        content: JSON.stringify(xbrlDoc.contexts, null, 2),
      });
    }
    
    // Add a section for units
    if (Object.keys(xbrlDoc.units).length > 0) {
      sections.push({
        type: FilingSectionType.SECTION,
        title: 'Units',
        content: JSON.stringify(xbrlDoc.units, null, 2),
      });
    }
    
    // Create sections for standardized metrics
    for (const [metricName, facts] of Object.entries(xbrlDoc.standardizedMetrics)) {
      if (facts.length > 0) {
        sections.push({
          type: FilingSectionType.SECTION,
          title: `Financial Metric: ${metricName}`,
          content: facts.map(fact => {
            const context = xbrlDoc.contexts[fact.contextRef];
            let periodInfo = '';
            
            if (context?.period) {
              if (context.period.instant) {
                periodInfo = `As of ${context.period.instant}`;
              } else if (context.period.startDate && context.period.endDate) {
                periodInfo = `From ${context.period.startDate} to ${context.period.endDate}`;
              }
            }
            
            return `${fact.conceptName}: ${fact.value} ${periodInfo}`;
          }).join('\n\n'),
        });
      }
    }
    
    // Create tables for facts
    const factsTable = [
      ['Concept', 'Value', 'Context', 'Unit', 'Decimals']
    ];
    
    for (const fact of xbrlDoc.facts) {
      factsTable.push([
        fact.conceptName,
        String(fact.value),
        fact.contextRef,
        fact.unitRef || '',
        fact.decimals !== undefined ? String(fact.decimals) : '',
      ]);
    }
    
    // Add facts table
    sections.push({
      type: FilingSectionType.TABLE,
      title: 'XBRL Facts',
      content: factsTable.map(row => row.join('\t')).join('\n'),
      tableData: factsTable,
    });
    
    // Extract important sections based on standard metrics
    const importantSections = {};
    
    for (const [metricName, facts] of Object.entries(xbrlDoc.standardizedMetrics)) {
      if (facts.length > 0) {
        importantSections[metricName] = facts.map(fact => {
          const context = xbrlDoc.contexts[fact.contextRef];
          let periodInfo = '';
          
          if (context?.period) {
            if (context.period.instant) {
              periodInfo = `As of ${context.period.instant}`;
            } else if (context.period.startDate && context.period.endDate) {
              periodInfo = `From ${context.period.startDate} to ${context.period.endDate}`;
            }
          }
          
          return `${fact.conceptName}: ${fact.value} ${periodInfo}`;
        }).join('\n\n');
      }
    }
    
    // Process filing date if available
    let filingDate;
    if (xbrlDoc.documentInfo.filingDate) {
      try {
        filingDate = new Date(xbrlDoc.documentInfo.filingDate);
      } catch (error) {
        logger.error('Error parsing filing date:', error);
      }
    }
    
    // Create the result object
    return {
      filingType: 'XBRL',
      companyName: xbrlDoc.documentInfo.companyName,
      filingDate,
      importantSections,
      sections,
      tables: sections.filter(section => section.type === FilingSectionType.TABLE),
      lists: sections.filter(section => section.type === FilingSectionType.LIST),
      metadata: {
        filingType: 'XBRL',
        companyName: xbrlDoc.documentInfo.companyName,
        filingDate,
      },
    };
  } catch (error) {
    logger.error('Error parsing XBRL as SEC filing:', error);
    throw new Error(`Failed to parse XBRL as SEC filing: ${error}`);
  }
}

// Export the functions
module.exports = {
  parseXBRL,
  parseXBRLFromBuffer,
  parseXBRLAsSECFiling,
  isXBRL,
  FilingSectionType,
  STANDARD_FINANCIAL_METRICS
}; 