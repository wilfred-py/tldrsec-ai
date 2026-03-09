export interface Form144ParsedContent {
  reportingPerson: string;
  reportingPersonTitle: string;
  relationshipToIssuer: string;
  dateOfSale: string;
  amountOfSecurities: string;
  proposedSaleDate: string;
  broker: string;
  note: string;
  sharesOutstanding?: string;
  aggregateMarketValue?: string;
}
