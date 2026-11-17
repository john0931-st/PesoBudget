import { useEffect, useState } from 'react';
import {
  CurrencyConfig,
  SupportedCurrencyCode,
  getActiveCurrencyCode,
  getActiveCurrencyConfig,
  setActiveCurrencyCode,
  subscribeCurrencyChange,
} from '../utils/currency';

export function useCurrency(): {
  currencyCode: SupportedCurrencyCode;
  currency: CurrencyConfig;
  setCurrency: (code: SupportedCurrencyCode) => void;
} {
  const [currencyCode, setCurrencyCodeState] = useState<SupportedCurrencyCode>(() =>
    getActiveCurrencyCode()
  );

  useEffect(() => {
    return subscribeCurrencyChange(() => {
      setCurrencyCodeState(getActiveCurrencyCode());
    });
  }, []);

  return {
    currencyCode,
    currency: getActiveCurrencyConfig(currencyCode),
    setCurrency: setActiveCurrencyCode,
  };
}
