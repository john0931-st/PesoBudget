/**
 * Evaluates Excel-like formulas safely without using eval() or Function().
 * Supports basic arithmetic: +, -, *, /, parentheses, decimals, commas.
 * Examples: "=100+100", "= 500 + 250 + 75.50", "= (1200 * 2) - 150", "2500"
 */

export interface FormulaEvalResult {
  value: number;
  isFormula: boolean;
  isValid: boolean;
  displayValue: string;
  errorMessage?: string;
}

export function evaluateFormulaInput(rawInput: string): FormulaEvalResult {
  const trimmed = rawInput.trim();

  if (!trimmed) {
    return {
      value: 0,
      isFormula: false,
      isValid: true,
      displayValue: '',
    };
  }

  const isFormula = trimmed.startsWith('=');
  let expression = isFormula ? trimmed.slice(1).trim() : trimmed;

  // Clean expression: remove currency symbols and thousand commas
  expression = expression
    .replace(/(?:S\$|A\$|C\$|PHP|USD|EUR|GBP|JPY|SGD|AUD|CAD|KRW|AED)/gi, '')
    .replace(/[₱$€£¥₩Pphp,]/g, '')
    .trim();

  if (!expression) {
    return {
      value: 0,
      isFormula,
      isValid: true,
      displayValue: '',
    };
  }

  // Check for allowed characters only: digits, ., +, -, *, /, (, ), and whitespace
  if (!/^[\d\s\.\+\-\*\/\(\)]+$/.test(expression)) {
    return {
      value: 0,
      isFormula,
      isValid: false,
      displayValue: rawInput,
      errorMessage: 'Invalid characters in formula',
    };
  }

  try {
    const calculated = parseAndEvaluate(expression);
    if (isNaN(calculated) || !isFinite(calculated)) {
      return {
        value: 0,
        isFormula,
        isValid: false,
        displayValue: rawInput,
        errorMessage: 'Calculation resulted in NaN or Infinity',
      };
    }

    return {
      value: Math.round((calculated + Number.EPSILON) * 100) / 100,
      isFormula,
      isValid: true,
      displayValue: rawInput,
    };
  } catch (err) {
    return {
      value: 0,
      isFormula,
      isValid: false,
      displayValue: rawInput,
      errorMessage: err instanceof Error ? err.message : 'Invalid formula',
    };
  }
}

// Tokenizer & Recursive Descent Parser for safe arithmetic
type TokenType = 'NUMBER' | 'PLUS' | 'MINUS' | 'MUL' | 'DIV' | 'LPAREN' | 'RPAREN';

interface Token {
  type: TokenType;
  value: number | string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === '+') {
      tokens.push({ type: 'PLUS', value: '+' });
      i++;
    } else if (ch === '-') {
      tokens.push({ type: 'MINUS', value: '-' });
      i++;
    } else if (ch === '*') {
      tokens.push({ type: 'MUL', value: '*' });
      i++;
    } else if (ch === '/') {
      tokens.push({ type: 'DIV', value: '/' });
      i++;
    } else if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
    } else if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
    } else if (/[\d\.]/.test(ch)) {
      let numStr = '';
      let hasDot = false;
      while (i < expr.length && /[\d\.]/.test(expr[i])) {
        if (expr[i] === '.') {
          if (hasDot) break;
          hasDot = true;
        }
        numStr += expr[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
    } else {
      throw new Error(`Unexpected character: ${ch}`);
    }
  }

  return tokens;
}

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(expectedType?: TokenType): Token {
    const token = this.tokens[this.pos];
    if (!token) throw new Error('Unexpected end of formula');
    if (expectedType && token.type !== expectedType) {
      throw new Error(`Expected ${expectedType} but got ${token.type}`);
    }
    this.pos++;
    return token;
  }

  public parse(): number {
    if (this.tokens.length === 0) return 0;
    const res = this.expr();
    if (this.pos < this.tokens.length) {
      throw new Error('Unexpected extra tokens at end of formula');
    }
    return res;
  }

  // expr = term ((PLUS | MINUS) term)*
  private expr(): number {
    let result = this.term();

    while (this.peek()?.type === 'PLUS' || this.peek()?.type === 'MINUS') {
      const op = this.consume().type;
      const right = this.term();
      if (op === 'PLUS') result += right;
      else result -= right;
    }

    return result;
  }

  // term = factor ((MUL | DIV) factor)*
  private term(): number {
    let result = this.factor();

    while (this.peek()?.type === 'MUL' || this.peek()?.type === 'DIV') {
      const op = this.consume().type;
      const right = this.factor();
      if (op === 'MUL') {
        result *= right;
      } else {
        if (right === 0) throw new Error('Division by zero');
        result /= right;
      }
    }

    return result;
  }

  // factor = (PLUS | MINUS)? primary
  private factor(): number {
    const token = this.peek();
    if (token?.type === 'PLUS') {
      this.consume();
      return this.factor();
    }
    if (token?.type === 'MINUS') {
      this.consume();
      return -this.factor();
    }
    return this.primary();
  }

  // primary = NUMBER | LPAREN expr RPAREN
  private primary(): number {
    const token = this.consume();
    if (token.type === 'NUMBER') {
      return token.value as number;
    }
    if (token.type === 'LPAREN') {
      const val = this.expr();
      this.consume('RPAREN');
      return val;
    }
    throw new Error(`Unexpected token: ${token.type}`);
  }
}

function parseAndEvaluate(expr: string): number {
  const tokens = tokenize(expr);
  const parser = new Parser(tokens);
  return parser.parse();
}
