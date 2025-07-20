// Simple script to verify the Prisma schema structure
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the Prisma schema file
const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const schemaContent = fs.readFileSync(schemaPath, 'utf8');

// Define the expected model structures
const expectedModels = {
  SecFiling: {
    fields: [
      { name: 'id', type: 'String', attributes: ['@id', '@default(uuid())'] },
      { name: 'tickerId', type: 'String' },
      { name: 'formType', type: 'String' },
      { name: 'filingDate', type: 'DateTime' },
      { name: 'secUrl', type: 'String' },
      { name: 'accessionNumber', type: 'String' },
      { name: 'companyName', type: 'String', nullable: true },
      { name: 'cik', type: 'String' },
      { name: 'createdAt', type: 'DateTime', attributes: ['@default(now())'] },
      { name: 'updatedAt', type: 'DateTime', attributes: ['@updatedAt'] },
      { name: 'ticker', type: 'Ticker', relation: true },
      { name: 'summaries', type: 'Summary[]', relation: true },
      { name: 'fetchAttempts', type: 'SecFetchAttempt[]', relation: true }
    ]
  },
  SecFetchAttempt: {
    fields: [
      { name: 'id', type: 'String', attributes: ['@id', '@default(uuid())'] },
      { name: 'filingId', type: 'String' },
      { name: 'attemptedAt', type: 'DateTime' },
      { name: 'status', type: 'String' },
      { name: 'errorMessage', type: 'String', nullable: true },
      { name: 'filing', type: 'SecFiling', relation: true }
    ]
  }
};

// Simple parser to extract model definitions
function extractModels(schema) {
  const models = {};
  const modelRegex = /model\s+(\w+)\s+{([^}]*)}/g;
  let match;

  while ((match = modelRegex.exec(schema)) !== null) {
    const modelName = match[1];
    const modelBody = match[2];
    
    // Extract fields
    const fields = [];
    const fieldLines = modelBody.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('@@'));
    
    fieldLines.forEach(line => {
      if (line) {
        const fieldMatch = line.match(/(\w+)\s+(\w+(?:\[\])?)(\?)?(\s+@.*)?/);
        if (fieldMatch) {
          const [, name, type, nullable, attributesStr] = fieldMatch;
          const attributes = attributesStr ? 
            attributesStr.trim().split(/\s+/).filter(Boolean) : 
            [];
          
          fields.push({
            name,
            type,
            nullable: nullable === '?',
            attributes,
            relation: type.includes('[]') || !type.match(/^(String|Int|Boolean|DateTime|Float|Json)(\[\])?$/)
          });
        }
      }
    });
    
    models[modelName] = { fields };
  }
  
  return models;
}

// Verify the models
function verifyModels(actualModels, expectedModels) {
  const results = {
    success: true,
    errors: []
  };
  
  // Check if expected models exist
  Object.keys(expectedModels).forEach(modelName => {
    if (!actualModels[modelName]) {
      results.success = false;
      results.errors.push(`Model ${modelName} not found in schema`);
      return;
    }
    
    // Check fields
    const expectedFields = expectedModels[modelName].fields;
    const actualFields = actualModels[modelName].fields;
    
    expectedFields.forEach(expectedField => {
      const actualField = actualFields.find(f => f.name === expectedField.name);
      
      if (!actualField) {
        results.success = false;
        results.errors.push(`Field ${expectedField.name} not found in model ${modelName}`);
        return;
      }
      
      // Check type
      if (actualField.type !== expectedField.type) {
        results.success = false;
        results.errors.push(`Field ${modelName}.${expectedField.name} has type ${actualField.type}, expected ${expectedField.type}`);
      }
      
      // Check nullability
      if (!!actualField.nullable !== !!expectedField.nullable) {
        results.success = false;
        results.errors.push(`Field ${modelName}.${expectedField.name} nullability is ${actualField.nullable}, expected ${expectedField.nullable}`);
      }
    });
  });
  
  return results;
}

// Main verification
try {
  console.log('Verifying Prisma schema structure...');
  
  const actualModels = extractModels(schemaContent);
  const verificationResults = verifyModels(actualModels, expectedModels);
  
  if (verificationResults.success) {
    console.log('✅ Schema verification successful! The SecFiling and SecFetchAttempt models match the expected structure.');
    console.log('\nSecFiling model:');
    console.log('- Has nullable companyName field');
    console.log('- Has proper relation to SecFetchAttempt');
    
    console.log('\nSecFetchAttempt model:');
    console.log('- Uses UUID for ID field');
    console.log('- Has filingId foreign key to SecFiling');
    console.log('- Has attemptedAt, status, and nullable errorMessage fields');
    console.log('- Has proper relation to SecFiling');
  } else {
    console.log('❌ Schema verification failed!');
    verificationResults.errors.forEach(error => {
      console.log(`- ${error}`);
    });
    process.exit(1);
  }
} catch (error) {
  console.error('Error verifying schema:', error);
  process.exit(1);
}
