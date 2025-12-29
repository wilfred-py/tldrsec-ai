import { getSecFilingViewerUrl } from '../../lib/email/url-utils';

describe('getSecFilingViewerUrl - XML Handling', () => {
  describe('XML files with XSLT stylesheet path (already formatted)', () => {
    it('should pass through Form 4 XML with xslF345X05 path', () => {
      const url = 'https://www.sec.gov/Archives/edgar/data/0001045810/000119903925000015/xslF345X05/wk-form4_1766450107.xml';
      expect(getSecFilingViewerUrl(url)).toBe(url);
    });

    it('should pass through Form 3 XML with xslF345X03 path', () => {
      const url = 'https://www.sec.gov/Archives/edgar/data/12345/000012345025000001/xslF345X03/form3.xml';
      expect(getSecFilingViewerUrl(url)).toBe(url);
    });

    it('should pass through Form 144 XML with xsl144X01 path', () => {
      const url = 'https://www.sec.gov/Archives/edgar/data/1548760/000192109423000952/xsl144X01/primary_doc.xml';
      expect(getSecFilingViewerUrl(url)).toBe(url);
    });
  });

  describe('XML files without XSLT stylesheet path - Form 3/4/5 (ownership forms)', () => {
    it('should construct xslF345X05 viewer URL for Form 4 XML without stylesheet', () => {
      const inputUrl = 'https://www.sec.gov/Archives/edgar/data/1234567/000123456725000001/form4.xml';
      const result = getSecFilingViewerUrl(inputUrl, 'Form 4');

      expect(result).toContain('/xslF345X05/');
      expect(result).toContain('form4.xml');
    });

    it('should construct xslF345X05 viewer URL for Form 3 XML without stylesheet', () => {
      const inputUrl = 'https://www.sec.gov/Archives/edgar/data/0001234567/000123456725000001/form3.xml';
      const result = getSecFilingViewerUrl(inputUrl, 'Form 3');

      expect(result).toContain('/xslF345X05/');
      expect(result).toContain('form3.xml');
    });

    it('should construct xslF345X05 viewer URL for Form 5 XML without stylesheet', () => {
      const inputUrl = 'https://www.sec.gov/Archives/edgar/data/1234567/000123456725000001/form5.xml';
      const result = getSecFilingViewerUrl(inputUrl, 'Form 5');

      expect(result).toContain('/xslF345X05/');
      expect(result).toContain('form5.xml');
    });

    it('should handle form type without "Form" prefix', () => {
      const inputUrl = 'https://www.sec.gov/Archives/edgar/data/1234567/000123456725000001/form4.xml';
      const result = getSecFilingViewerUrl(inputUrl, '4');

      expect(result).toContain('/xslF345X05/');
    });
  });

  describe('XML files without XSLT stylesheet path - Form 144', () => {
    it('should construct xsl144X01 viewer URL for Form 144 XML without stylesheet', () => {
      const inputUrl = 'https://www.sec.gov/Archives/edgar/data/0002001558/000200155825000123/primary_doc.xml';
      const result = getSecFilingViewerUrl(inputUrl, 'Form 144');

      expect(result).toContain('/xsl144X01/');
      expect(result).toContain('primary_doc.xml');
    });

    it('should handle 144 form type without "Form" prefix', () => {
      const inputUrl = 'https://www.sec.gov/Archives/edgar/data/0002001558/000200155825000123/primary_doc.xml';
      const result = getSecFilingViewerUrl(inputUrl, '144');

      expect(result).toContain('/xsl144X01/');
    });
  });

  describe('XML files without known form type - fallback to index', () => {
    it('should fallback to index URL when form type unknown and XML has no stylesheet', () => {
      const inputUrl = 'https://www.sec.gov/Archives/edgar/data/1652044/000200155825000123/unknown.xml';
      const result = getSecFilingViewerUrl(inputUrl); // No form type provided

      expect(result).toContain('-index.html');
    });

    it('should fallback to index URL for non-ownership form types', () => {
      const inputUrl = 'https://www.sec.gov/Archives/edgar/data/1652044/000200155825000123/data.xml';
      const result = getSecFilingViewerUrl(inputUrl, '10-K'); // 10-K is not an ownership form

      expect(result).toContain('-index.html');
    });
  });

  describe('existing behavior preserved', () => {
    it('should pass through HTML files', () => {
      const url = 'https://www.sec.gov/Archives/edgar/data/21344/000155278125000454/e25454_ko-8k.htm';
      expect(getSecFilingViewerUrl(url)).toBe(url);
    });

    it('should pass through .html files', () => {
      const url = 'https://www.sec.gov/Archives/edgar/data/21344/000155278125000454/e25454_ko-8k.html';
      expect(getSecFilingViewerUrl(url)).toBe(url);
    });

    it('should convert directory URL to index', () => {
      const url = 'https://www.sec.gov/Archives/edgar/data/0001679788/000167978825000249';
      const result = getSecFilingViewerUrl(url);
      expect(result).toContain('-index.html');
    });

    it('should return EDGAR search for empty URL', () => {
      expect(getSecFilingViewerUrl('')).toBe('https://www.sec.gov/edgar/searchedgar/companysearch.html');
    });

    it('should pass through -index.htm URLs as-is', () => {
      const url = 'https://www.sec.gov/Archives/edgar/data/0001679788/000167978825000249/0001679788-25-000249-index.htm';
      expect(getSecFilingViewerUrl(url)).toBe(url);
    });
  });
});
