const MATRIX_ENVS = 'bmatrix|pmatrix|matrix|vmatrix|Vmatrix|Bmatrix|array';

// \times → \t+imes, \theta → \t+heta, \tau → \t+au (tab = \t = charCode 9)
const TAB_DAMAGED_COMMANDS = /\x09(imes|heta|au|op|ilde)\b/g;

export function normalizeMathSource(source: string): string {
  let normalized = source
    .replace(TAB_DAMAGED_COMMANDS, (_, cmd) => `\\t${cmd}`)
    .replace(/(?<!\\)\bldots\b/g, String.raw`\ldots`)
    .replace(/\\(times|ldots)(?=[A-Za-z])/g, String.raw`\$1 `)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .replace(/[，。；;：:]$/u, '')
    // Fix \left{ → \left\{ and \right} → \right\}
    .replace(/\\left\{/g, '\\left\\{')
    .replace(/\\right\}/g, '\\right\\}')
    .replace(/\\left\}/g, '\\right\\}')
    .replace(/\\right\{/g, '\\right\\{')
    // Fix missing subscript: \mathbf{c}i → \mathbf{c}_i
    .replace(/\\mathbf\{([^}]+)\}([a-zA-Z0-9])(?!_|\{)/g, '\\mathbf{$1}_$2')
    // Fix \right}{i=1}^{N} → \right\}_{i=1}^{N}
    .replace(/\\right\\?\}\s*\{([^}]+)\}\^/g, '\\right\\}_{$1}^')
    .replace(new RegExp(`\\$\\s*(?=\\\\begin\\{(?:${MATRIX_ENVS})\\})`, 'g'), '');

  normalized = normalizeMatrixRowBreaks(normalized);
  normalized = normalizeDisplayEquationLines(normalized);

  return normalized
    .replace(/\\([A-Za-z]{1,12})\s+([A-Za-z]{2,12})(?=\b|\{)/g, (_match, left: string, right: string) => {
      const joined = `${left}${right}`;
      return isKnownLatexCommand(joined) ? `\\${joined}` : `\\${left} ${right}`;
    })
    .replace(/\\\s*\n\s*/g, '\\\\')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isKnownLatexCommand(command: string): boolean {
  return [
    'left', 'right', 'boldsymbol', 'mathbf', 'mathbb', 'mathcal', 'mathit', 'mathrm',
    'frac', 'sqrt', 'exp', 'sum', 'prod', 'int', 'alpha', 'beta', 'gamma', 'delta',
    'theta', 'lambda', 'sigma', 'Sigma', 'mu', 'pi', 'rho', 'tau', 'omega', 'Omega'
  ].includes(command);
}

function normalizeDisplayEquationLines(source: string): string {
  const lines = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return source;
  }

  const joined = lines.join(' ');
  let fixed = joined
    .replace(/\\prod\s*\{([^{}]+)\}/g, '\\prod_{$1}')
    .replace(/G'i\b/g, "G'_i")
    .replace(/G'j\b/g, "G'_j");

  const balance = braceBalance(fixed);
  if (balance > 0) {
    fixed += '}'.repeat(balance);
  }

  return fixed;
}

function braceBalance(value: string): number {
  let balance = 0;
  for (const char of value) {
    if (char === '{') {
      balance += 1;
    } else if (char === '}') {
      balance = Math.max(0, balance - 1);
    }
  }
  return balance;
}

function normalizeMatrixRowBreaks(source: string): string {
  return source.replace(
    new RegExp(`\\\\begin\\{(${MATRIX_ENVS})\\}([\\s\\S]*?)\\\\end\\{\\1\\}`, 'g'),
    (_match: string, environment: string, body: string) => {
      const fixedBody = body
        .trim()
        .replace(/\\\\\s*\\\\\s*/g, '\\\\ ')
        .replace(/\\\\\s+/g, '\\\\ ')
        .replace(/\\(?!\\|[A-Za-z])/g, '\\\\')
        .replace(/\\\s*(?=\\)/g, '')
        .replace(/\\([A-Za-z](?:_\{[^{}]+\}|_\d+)?(?=\s*&))/g, '\\\\ $1')
        .replace(/\\\\\s*\n+/g, '\\\\ ')
        .replace(/\n+/g, '\\\\ ')
        .replace(/\\\s*(?=[0-9?+-])/g, '\\\\ ')
        .replace(/\\\\\s*(?=(?:[A-Za-z]+|[A-Za-z]+_\{|[A-Za-z]+_\d|\\(?:vdots|ddots|cdots|ldots|dots)))/g, '\\\\ ')
        .replace(/\\\\\s*$/g, '');

      return `\\begin{${environment}}${fixedBody}\\end{${environment}}`;
    }
  );
}

export function normalizeMathDelimiters(source: string): string {
  // Handle AI output: \\[...\\] → \[...\] and \\(...\\) → \(...\)
  const unescaped = source
    .replace(/\\\\\[/g, '\\[')
    .replace(/\\\\\]/g, '\\]')
    .replace(/\\\\\(/g, '\\(')
    .replace(/\\\\\)/g, '\\)');

  return closeUnterminatedMatrixMath(unescaped)
    .replace(/(^|[\s:：。])([A-Za-z][A-Za-z0-9_]*\([^\n$]*?\)\s*\\(?:rightarrow|to)\s*\([^\n$]*?\))\$/g, '$1$$$2$')
    .replace(/\$\s*\$/g, () => '$$');
}

function closeUnterminatedMatrixMath(source: string): string {
  return source.replace(
    new RegExp(`\\$([^$]*?\\\\begin\\{(?:${MATRIX_ENVS})\\}[^$]*?\\\\end\\{(?:${MATRIX_ENVS})\\})(?=[，。；;：:]|$)`, 'g'),
    '$$$1$'
  );
}

export { MATRIX_ENVS };
