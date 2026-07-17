import type { Variable } from './types';

// Helper to determine if a formula is a simple number
export function isStaticNumber(formula: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(formula.trim());
}

// Format displays: omit decimals if integer, show up to 2 decimal places otherwise
export function formatDisplayValue(val: number): string {
  const formatted = val.toFixed(2);
  if (formatted.endsWith('.00')) {
    return val.toString();
  }
  if (formatted.endsWith('0')) {
    return val.toFixed(1);
  }
  return formatted;
}

// Live JS Compiler / Syntax Check
export function compileFormula(formulaStr: string, activeId: string, variables: Variable[]): { error: string | null } {
  const cleanFormulaStr = formulaStr.trim();
  if (!cleanFormulaStr) {
    return { error: 'Empty expression' };
  }
  
  if (isStaticNumber(cleanFormulaStr)) {
    return { error: null };
  }

  try {
    const mathKeys = Object.getOwnPropertyNames(Math);
    const mathValues = mathKeys.map((key) => (Math as any)[key]);
    
    // Scan variables referenced in this formula
    const referenced: string[] = [];
    variables.forEach((x) => {
      if (x.id !== activeId && new RegExp(`\\b${x.id}\\b`).test(cleanFormulaStr)) {
        referenced.push(x.id);
      }
    });

    const mockValues = referenced.map(() => 0);

    // Support both simple math expressions and complex returning code block strings
    const hasReturn = /\breturn\b/.test(cleanFormulaStr);
    const functionBody = hasReturn 
      ? `"use strict"; ${cleanFormulaStr}`
      : `"use strict"; return (${cleanFormulaStr});`;

    const fn = new Function(...mathKeys, ...referenced, functionBody);
    fn(...mathValues, ...mockValues);

    return { error: null };
  } catch (err: any) {
    return { error: err.message || 'Invalid syntax' };
  }
}

// Escapes HTML tags and highlights syntax variables with colors (hl-1 to hl-5)
export function syntaxHighlight(formula: string, activeId: string, variables: Variable[]): string {
  let escaped = formula
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Sort variables descending by length to prevent partial matching (e.g. matching 'A' in 'A1')
  const sortedVars = [...variables]
    .filter(x => x.id !== activeId)
    .sort((a, b) => b.id.length - a.id.length);

  const refIds = sortedVars
    .filter((x) => new RegExp(`\\b${x.id}\\b`).test(formula))
    .map(x => x.id);

  refIds.forEach((id, index) => {
    const colorIndex = (index % 5) + 1;
    const regex = new RegExp(`\\b${id}\\b`, 'g');
    escaped = escaped.replace(regex, `<span class="hl-${colorIndex}">${id}</span>`);
  });

  return escaped;
}

// Safe equation evaluator for active board variables
export function evaluateAllVariables(variables: Variable[]) {
  const values: Record<string, number> = {};
  const errorVars = new Set<string>();

  function resolve(id: string, path: Set<string>): number {
    if (path.has(id)) {
      errorVars.add(id);
      throw new Error('Circular dependency');
    }

    if (id in values) {
      return values[id];
    }

    const v = variables.find((x) => x.id === id);
    if (!v) return 0;

    const formulaStr = v.formula.trim();

    if (isStaticNumber(formulaStr)) {
      const parsed = parseFloat(formulaStr);
      values[id] = parsed;
      v.value = parsed;
      v.hasError = false;
      return parsed;
    }

    path.add(id);

    try {
      const mathKeys = Object.getOwnPropertyNames(Math);
      const mathValues = mathKeys.map((key) => (Math as any)[key]);

      const referenced: string[] = [];
      variables.forEach((x) => {
        if (x.id !== id && new RegExp(`\\b${x.id}\\b`).test(formulaStr)) {
          referenced.push(x.id);
        }
      });

      const resolvedVars: Record<string, number> = {};
      referenced.forEach((refId) => {
        resolvedVars[refId] = resolve(refId, new Set(path));
      });

      const argNames = Object.keys(resolvedVars);
      const argValues = Object.values(resolvedVars);

      const hasReturn = /\breturn\b/.test(formulaStr);
      const functionBody = hasReturn 
        ? `"use strict"; ${formulaStr}`
        : `"use strict"; return (${formulaStr});`;

      const fn = new Function(...mathKeys, ...argNames, functionBody);
      const rawResult = fn(...mathValues, ...argValues);

      if (rawResult === null || rawResult === undefined || typeof rawResult !== 'number' || isNaN(rawResult) || !isFinite(rawResult)) {
        throw new Error('Invalid math outcome');
      }

      values[id] = rawResult;
      v.value = rawResult;
      v.hasError = false;
      return rawResult;
    } catch (_err) {
      errorVars.add(id);
      v.hasError = true;
      values[id] = 0;
      v.value = 0;
      return 0;
    }
  }

  // Resolve everyone
  variables.forEach((v) => {
    try {
      resolve(v.id, new Set());
    } catch (_e) {
      // Circular references caught
    }
  });

  // Mark all dependencies recursively failing if root fails
  variables.forEach((v) => {
    if (errorVars.has(v.id)) {
      v.hasError = true;
    }
  });
}
