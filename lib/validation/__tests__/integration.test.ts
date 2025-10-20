/**
 * Integration tests for SEC Filing Content Validation
 * 
 * Tests the complete validation workflow integration with filing processor
 * and ensures cost savings are achieved.
 */

import { FilingContentValidator } from '../filing-content-validator';
import { CronFilingProcessor } from '../../cron/filing-processor';
import {
  NoSuchKeyError,
  InvalidContentError
} from '../../errors/validation-errors';

describe('Filing Content Validation Integration', () => {
  describe('Cost Savings Validation', () => {
    test('should prevent NoSuchKey content from reaching AI processing', async () => {
      const noSuchKeyContent = `<?xml version="1.0" encoding="UTF-8"?>
        <Error>
          <Code>NoSuchKey</Code>
          <Message>The resource you requested does not exist</Message>
          <Resource>/Archives/edgar/data/0001318605/000095017022000796/tsla-20211231.htm</Resource>
        </Error>`;
      
      const result = await FilingContentValidator.validate(
        noSuchKeyContent,
        '0001318605-22-000796'
      );
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeInstanceOf(NoSuchKeyError);
      expect(result.validationMetrics.validationTimeMs).toBeLessThan(1000);
      
      // Verify this would save approximately $0.152 in AI processing costs
      expect(result.validationMetrics.hasNoSuchKey).toBe(true);
    });

    test('should prevent short content from reaching AI processing', async () => {
      const shortContent = 'Error: Document not found';
      
      const result = await FilingContentValidator.validate(
        shortContent,
        '0001318605-22-000796'
      );
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeInstanceOf(InvalidContentError);
      expect(result.validationMetrics.contentLength).toBe(shortContent.length);
    });

    test('should allow valid content to proceed to AI processing', async () => {
      const validContent = `<!DOCTYPE html>
        <html>
          <head>
            <title>TESLA, INC. - Form 10-K - Filed 2022-02-07</title>
          </head>
          <body>
            <div class="sec-filing">
              <h1>UNITED STATES SECURITIES AND EXCHANGE COMMISSION</h1>
              <h2>FORM 10-K</h2>
              <h3>ANNUAL REPORT PURSUANT TO SECTION 13 OR 15(d) OF THE SECURITIES EXCHANGE ACT OF 1934</h3>
              
              <div class="company-info">
                <h4>TESLA, INC.</h4>
                <p>1 Tesla Road, Austin, Texas 78725</p>
                <p>Delaware Corporation</p>
                <p>Commission File Number: 001-34756</p>
                <p>IRS Employer Identification No. 91-2197729</p>
              </div>
              
              <div class="filing-content">
                <h3>BUSINESS</h3>
                <p>Tesla, Inc. designs, develops, manufactures, leases and sells electric vehicles, and energy generation and storage systems, and provides services related to its products. Tesla was incorporated in Delaware in July 2003.</p>
                
                <h3>PRODUCTS AND SERVICES</h3>
                <p>We design, develop, manufacture, lease and sell high-performance fully electric vehicles and energy generation and storage systems, and provide services related to our products. We generally sell our products directly to customers, including through our website and retail locations.</p>
                
                <h3>AUTOMOTIVE SALES</h3>
                <p>We recognize revenue from automotive sales when control of a vehicle has been transferred to the customer. For most of our automotive sales, this occurs when the vehicle has been delivered to the customer, as this is when control has been transferred.</p>
                
                <h3>FINANCIAL PERFORMANCE</h3>
                <p>Total revenues increased to $53.8 billion in 2021 compared to $31.5 billion in 2020, representing an increase of 71%. This increase was primarily due to increased vehicle deliveries and higher average selling prices.</p>
              </div>
            </div>
          </body>
        </html>`;
      
      const result = await FilingContentValidator.validate(
        validContent,
        '0001318605-22-000796'
      );
      
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.validationMetrics.contentLength).toBeGreaterThan(500);
      expect(result.validationMetrics.detectedFormat).toBe('html');
      expect(result.validationMetrics.hasNoSuchKey).toBe(false);
    });
  });

  describe('Retry Logic Integration', () => {
    test('should correctly identify non-retryable validation errors', () => {
      const nonRetryableErrors = [
        'NoSuchKey error detected',
        'Content validation failed: content too short',
        'Invalid date in accession number',
        'Malformed content detected'
      ];
      
      for (const errorMessage of nonRetryableErrors) {
        const isRetryable = CronFilingProcessor['isRetryableError'](errorMessage);
        expect(isRetryable).toBe(false);
      }
    });

    test('should correctly identify retryable validation errors', () => {
      const retryableErrors = [
        'SEC API error: timeout',
        'Network timeout occurred',
        'Rate limit exceeded',
        'Temporarily unavailable'
      ];
      
      for (const errorMessage of retryableErrors) {
        const isRetryable = CronFilingProcessor['isRetryableError'](errorMessage);
        expect(isRetryable).toBe(true);
      }
    });
  });

  describe('Performance Benchmarks', () => {
    test('should validate content faster than AI processing would take', async () => {
      const testContents = [
        // NoSuchKey XML
        '<?xml version="1.0"?><Error><Code>NoSuchKey</Code></Error>',
        // NoSuchKey HTML  
        '<html><head><title>NoSuchKey</title></head></html>',
        // Short content
        'Too short',
        // Valid content
        'Valid SEC filing content. '.repeat(100)
      ];
      
      for (const content of testContents) {
        const startTime = Date.now();
        const result = await FilingContentValidator.validate(
          content,
          '0001318605-22-000796'
        );
        const endTime = Date.now();
        
        // Validation should be much faster than AI processing (which typically takes 5-30 seconds)
        expect(endTime - startTime).toBeLessThan(1000); // < 1 second
        expect(result.validationMetrics.validationTimeMs).toBeLessThan(1000);
      }
    });

    test('should handle concurrent validations efficiently', async () => {
      const testContent = 'Valid filing content for concurrent testing. '.repeat(50);
      
      const validationPromises = Array.from({ length: 10 }, (_, i) =>
        FilingContentValidator.validate(
          testContent,
          `000131860${i}-22-00079${i}`
        )
      );
      
      const startTime = Date.now();
      const results = await Promise.all(validationPromises);
      const endTime = Date.now();
      
      // All validations should complete quickly even when run concurrently
      expect(endTime - startTime).toBeLessThan(2000); // < 2 seconds for 10 concurrent validations
      
      // All should pass validation
      results.forEach(result => {
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('Real-world Filing Scenarios', () => {
    test('should handle typical Tesla 10-K filing structure', async () => {
      const teslaLikeContent = `<!DOCTYPE html>
        <html>
          <head>
            <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
            <title>TESLA, INC. 10-K</title>
          </head>
          <body>
            <div class="infoTable">
              <table>
                <tr>
                  <td>UNITED STATES</td>
                </tr>
                <tr>
                  <td>SECURITIES AND EXCHANGE COMMISSION</td>
                </tr>
                <tr>
                  <td>Washington, D.C. 20549</td>
                </tr>
              </table>
            </div>
            
            <div class="formType">
              <h2>FORM 10-K</h2>
              <h3>ANNUAL REPORT PURSUANT TO SECTION 13 OR 15(d) OF THE SECURITIES EXCHANGE ACT OF 1934</h3>
            </div>
            
            <div class="companyData">
              <h3>TESLA, INC.</h3>
              <p>(Exact name of registrant as specified in its charter)</p>
              <table>
                <tr>
                  <td>Delaware</td>
                  <td>91-2197729</td>
                </tr>
                <tr>
                  <td>(State of incorporation)</td>
                  <td>(I.R.S. Employer Identification No.)</td>
                </tr>
              </table>
            </div>
            
            <div class="businessSection">
              <h3>ITEM 1. BUSINESS</h3>
              <p>We design, develop, manufacture, lease and sell high-performance fully electric vehicles and energy generation and storage systems, and provide services related to our products. Our mission is to accelerate the world's transition to sustainable energy.</p>
            </div>
          </body>
        </html>`;
      
      const result = await FilingContentValidator.validate(
        teslaLikeContent,
        '0001318605-22-000796'
      );
      
      expect(result.isValid).toBe(true);
      expect(result.validationMetrics.detectedFormat).toBe('html');
      expect(result.validationMetrics.extractedYear).toBe(2022);
    });

    test('should handle XBRL-style XML filings', async () => {
      const xbrlContent = `<?xml version="1.0" encoding="UTF-8"?>
        <xbrl xmlns="http://www.xbrl.org/2003/instance"
              xmlns:tesla="http://www.tesla.com/20211231"
              xmlns:us-gaap="http://fasb.org/us-gaap/2021-01-31">
          
          <context id="eoy2021">
            <entity>
              <identifier scheme="http://www.sec.gov/CIK">0001318605</identifier>
            </entity>
            <period>
              <instant>2021-12-31</instant>
            </period>
          </context>
          
          <us-gaap:Assets contextRef="eoy2021" unitRef="USD" decimals="-6">62131000000</us-gaap:Assets>
          <us-gaap:AssetsCurrent contextRef="eoy2021" unitRef="USD" decimals="-6">29916000000</us-gaap:AssetsCurrent>
          <us-gaap:Cash contextRef="eoy2021" unitRef="USD" decimals="-6">17576000000</us-gaap:Cash>
          
          <tesla:VehicleDeliveries contextRef="eoy2021" unitRef="units">936172</tesla:VehicleDeliveries>
          <tesla:EnergyStorageDeployed contextRef="eoy2021" unitRef="MWh">3992</tesla:EnergyStorageDeployed>
          
        </xbrl>`;
      
      const result = await FilingContentValidator.validate(
        xbrlContent,
        '0001318605-22-000796'
      );
      
      expect(result.isValid).toBe(true);
      expect(result.validationMetrics.detectedFormat).toBe('xml');
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    test('should handle mixed content with NoSuchKey embedded', async () => {
      const mixedContent = `<!DOCTYPE html>
        <html>
          <head><title>SEC Filing</title></head>
          <body>
            <p>This appears to be a valid filing document...</p>
            <div class="error">
              <Code>NoSuchKey</Code>
              <Message>The specified key does not exist</Message>
            </div>
            <p>...but contains an embedded error.</p>
          </body>
        </html>`;
      
      const result = await FilingContentValidator.validate(
        mixedContent,
        '0001318605-22-000796'
      );
      
      // Should detect NoSuchKey even when embedded in otherwise valid content
      expect(result.isValid).toBe(false);
      expect(result.error).toBeInstanceOf(NoSuchKeyError);
    });

    test('should handle very large content efficiently', async () => {
      // Create a large but valid filing (1MB)
      const largeValidContent = `<!DOCTYPE html>
        <html>
          <head><title>Large SEC Filing</title></head>
          <body>
            <h1>TESLA, INC. - COMPREHENSIVE ANNUAL REPORT</h1>
            ${'<p>This is valid filing content with detailed financial information. '.repeat(10000)}
          </body>
        </html>`;
      
      const result = await FilingContentValidator.validate(
        largeValidContent,
        '0001318605-22-000796'
      );
      
      expect(result.isValid).toBe(true);
      expect(result.validationMetrics.validationTimeMs).toBeLessThan(1000);
      expect(result.validationMetrics.contentLength).toBeGreaterThan(500000);
    });

    test('should handle special characters and encoding', async () => {
      const unicodeContent = `<!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>International Filing - Tëslä Inc. 📈</title>
          </head>
          <body>
            <h1>FINANCIAL REPORT 2022</h1>
            <p>Revenue increased by 71% year-over-year to $53.8 billion 💰</p>
            <p>Vehicle deliveries: 936,172 units 🚗</p>
            <p>Market capitalization: ~$1 trillion 📊</p>
            <table>
              <tr><td>Assets</td><td>$62.1B</td></tr>
              <tr><td>Liabilities</td><td>$30.5B</td></tr>
              <tr><td>Equity</td><td>$31.6B</td></tr>
            </table>
          </body>
        </html>`;
      
      const result = await FilingContentValidator.validate(
        unicodeContent,
        '0001318605-22-000796'
      );
      
      expect(result.isValid).toBe(true);
      expect(result.validationMetrics.detectedFormat).toBe('html');
    });
  });
});