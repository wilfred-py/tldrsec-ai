import brkMultiCurrency from './brkMultiCurrency.json';
import googleSingleCurrency from './googleSingleCurrency.json';
import googleEuro from './googleEuro.json';
import singleTranche from './singleTranche.json';
import emptyTranches from './emptyTranches.json';
import malformedAmount from './malformedAmount.json';
import perpetualMaturity from './perpetualMaturity.json';
import floatingRate from './floatingRate.json';
import coFiled203And101 from './coFiled203And101.json';
import xssPayload from './xssPayload.json';

export const fixtures = {
  brkMultiCurrency,
  googleSingleCurrency,
  googleEuro,
  singleTranche,
  emptyTranches,
  malformedAmount,
  perpetualMaturity,
  floatingRate,
  coFiled203And101,
  xssPayload,
} as const;

export type SummaryFixture = typeof fixtures[keyof typeof fixtures];
