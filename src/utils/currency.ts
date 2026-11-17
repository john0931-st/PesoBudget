/**
 * Currency formatting and international currency toggle utilities.
 * Supports Philippine Peso (PHP) by default alongside major international currencies.
 */

export type SupportedCurrencyCode =
  | 'PHP'
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'JPY'
  | 'SGD'
  | 'AUD'
  | 'CAD'
  | 'KRW'
  | 'AED';

export interface CurrencyConfig {
  code: SupportedCurrencyCode;
  symbol: string;
  asciiCode: string;
  name: string;
  locale: string;
  decimals: number;
}

export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  { code: 'PHP', symbol: '₱', asciiCode: 'PHP', name: 'Philippine Peso', locale: 'en-PH', decimals: 2 },
  { code: 'USD', symbol: '$', asciiCode: 'USD', name: 'US Dollar', locale: 'en-US', decimals: 2 },
  { code: 'EUR', symbol: '€', asciiCode: 'EUR', name: 'Euro', locale: 'en-US', decimals: 2 },
  { code: 'GBP', symbol: '£', asciiCode: 'GBP', name: 'British Pound', locale: 'en-GB', decimals: 2 },
  { code: 'JPY', symbol: '¥', asciiCode: 'JPY', name: 'Japanese Yen', locale: 'en-US', decimals: 0 },
  { code: 'SGD', symbol: 'S$', asciiCode: 'SGD', name: 'Singapore Dollar', locale: 'en-SG', decimals: 2 },
  { code: 'AUD', symbol: 'A$', asciiCode: 'AUD', name: 'Australian Dollar', locale: 'en-AU', decimals: 2 },
  { code: 'CAD', symbol: 'C$', asciiCode: 'CAD', name: 'Canadian Dollar', locale: 'en-CA', decimals: 2 },
  { code: 'KRW', symbol: '₩', asciiCode: 'KRW', name: 'South Korean Won', locale: 'en-US', decimals: 0 },
  { code: 'AED', symbol: 'AED ', asciiCode: 'AED', name: 'UAE Dirham', locale: 'en-AE', decimals: 2 },
];

const CURRENCY_MAP: Record<SupportedCurrencyCode, CurrencyConfig> = SUPPORTED_CURRENCIES.reduce(
  (acc, item) => {
    acc[item.code] = item;
    return acc;
  },
  {} as Record<SupportedCurrencyCode, CurrencyConfig>
);

const CURRENCY_STORAGE_KEY = 'pesobudget_currency_v1';
const CURRENCY_LISTENERS: Array<() => void> = [];

let cachedCurrencyCode: SupportedCurrencyCode | null = null;

export function getActiveCurrencyCode(): SupportedCurrencyCode {
  if (cachedCurrencyCode && CURRENCY_MAP[cachedCurrencyCode]) {
    return cachedCurrencyCode;
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(CURRENCY_STORAGE_KEY) as SupportedCurrencyCode | null;
      if (saved && CURRENCY_MAP[saved]) {
        cachedCurrencyCode = saved;
        return saved;
      }
    }
  } catch {
    // ignore storage read error
  }
  cachedCurrencyCode = 'PHP';
  return 'PHP';
}

export function getActiveCurrencyConfig(code?: SupportedCurrencyCode): CurrencyConfig {
  const targetCode = code && CURRENCY_MAP[code] ? code : getActiveCurrencyCode();
  return CURRENCY_MAP[targetCode] || CURRENCY_MAP.PHP;
}

export function setActiveCurrencyCode(code: SupportedCurrencyCode): void {
  if (!CURRENCY_MAP[code]) return;
  cachedCurrencyCode = code;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(CURRENCY_STORAGE_KEY, code);
    }
  } catch {
    // ignore storage write error
  }
  CURRENCY_LISTENERS.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore subscriber errors
    }
  });
}

export function subscribeCurrencyChange(listener: () => void): () => void {
  CURRENCY_LISTENERS.push(listener);
  return () => {
    const idx = CURRENCY_LISTENERS.indexOf(listener);
    if (idx !== -1) {
      CURRENCY_LISTENERS.splice(idx, 1);
    }
  };
}

export function formatCurrency(
  amount: number,
  options?: {
    showDecimals?: boolean;
    includeSymbol?: boolean;
    useParenthesesForNegative?: boolean;
    currencyCode?: SupportedCurrencyCode;
    ascii?: boolean;
  }
): string {
  const config = getActiveCurrencyConfig(options?.currencyCode);
  const {
    showDecimals = config.decimals > 0,
    includeSymbol = true,
    useParenthesesForNegative = false,
    ascii = false,
  } = options || {};

  const fractionDigits = showDecimals ? config.decimals : 0;
  const zeroStr = fractionDigits > 0 ? `0.${'0'.repeat(fractionDigits)}` : '0';
  const symbolText = includeSymbol ? (ascii ? `${config.asciiCode} ` : config.symbol) : '';

  if (isNaN(amount) || !isFinite(amount)) {
    return `${symbolText}${zeroStr}`;
  }

  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);

  const formattedNumber = absAmount.toLocaleString(config.locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

  if (isNegative) {
    if (useParenthesesForNegative) {
      return `(${symbolText}${formattedNumber})`;
    }
    return `-${symbolText}${formattedNumber}`;
  }

  return `${symbolText}${formattedNumber}`;
}

export function formatPHP(
  amount: number,
  options?: {
    showDecimals?: boolean;
    includeSymbol?: boolean;
    useParenthesesForNegative?: boolean;
  }
): string {
  return formatCurrency(amount, options);
}

export function stripCurrencySymbols(input: string): string {
  if (!input) return '';
  return input
    .replace(/(?:S\$|A\$|C\$|PHP|USD|EUR|GBP|JPY|SGD|AUD|CAD|KRW|AED)/gi, '')
    .replace(/[₱$€£¥₩Pphp,]/g, '')
    .trim();
}

export function parseNumericString(input: string): number {
  if (!input) return 0;
  const cleaned = stripCurrencySymbols(input);
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}
