import { DOMParser } from '@xmldom/xmldom';
import * as xpath from 'xpath';
import { secLogger } from '../../utils/logger';
import { SecFilingDetails, Form144ParsedContent } from '../../types/sec';

export const parseForm144 = async (filingDetails: SecFilingDetails): Promise<Form144ParsedContent | null> => {
  try {
    const xmlContent = extractXmlContent(filingDetails.content);
    if (!xmlContent) {
      secLogger.error('No XML content found in Form 144 filing');
      return null;
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

    const select = xpath.useNamespaces({
      'ns': 'http://www.sec.gov/edgar/form144'
    });

    const getNodeText = (path: string): string => {
      const node = select(path, xmlDoc)[0] as Node;
      return node ? (node as any).textContent?.trim() || '' : '';
    };

    return {
      reportingPerson: getNodeText('//ns:reportingOwnerName'),
      reportingPersonTitle: getNodeText('//ns:reportingOwnerTitle'),
      relationshipToIssuer: getNodeText('//ns:relationshipToIssuer'),
      dateOfSale: getNodeText('//ns:saleDate'),
      amountOfSecurities: getNodeText('//ns:sharesAmount'),
      proposedSaleDate: getNodeText('//ns:proposedSaleDate'),
      broker: getNodeText('//ns:brokerName'),
      note: getNodeText('//ns:remarks') || ''
    };
  } catch (error) {
    secLogger.error(`Error parsing Form 144: ${error}`);
    return null;
  }
};

const extractXmlContent = (content: string): string | null => {
  try {
    const xmlMatch = content.match(/<(?:ns:)?XML>[\\s\\S]*?<\\/(?:ns:)?XML>/i);
    return xmlMatch ? xmlMatch[1].trim() : null;
  } catch (error) {
    secLogger.error(`Error extracting XML content: ${error}`);
    return null;
  }
};
