/**
 * Currency formatting utilities for Philippine Peso (PHP / ₱)
 */

export function formatPHP(
  amount: number,
  options?: {
    showDecimals?: boolean;
    includeSymbol?: boolean;
    useParenthesesForNegative?: boolean;
  }
): string {
  const {
    showDecimals = true,
    includeSymbol = true,
    useParenthesesForNegative = false,
  } = options || {};

  if (isNaN(amount) || !isFinite(amount)) {
    return includeSymbol ? '₱0.00' : '0.00';
  }

  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);

  const formattedNumber = absAmount.toLocaleString('en-PH', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  });

  const symbol = includeSymbol ? '₱' : '';

  if (isNegative) {
    if (useParenthesesForNegative) {
      return `(${symbol}${formattedNumber})`;
    }
    return `-${symbol}${formattedNumber}`;
  }

  return `${symbol}${formattedNumber}`;
}

export function parseNumericString(input: string): number {
  if (!input) return 0;
  const cleaned = input.replace(/[₱PphpPHP,]/g, '').trim();
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}
