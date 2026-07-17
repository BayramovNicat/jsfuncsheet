import type { Variable } from "./types";
import { saveStateToLocalStorage } from "./state";

const STATIC_NUMBER_REGEX = /^-?\d+(\.\d+)?$/;

// Helper to determine if a formula is a simple number
export function isStaticNumber(formula: string): boolean {
	return STATIC_NUMBER_REGEX.test(formula.trim());
}

// Format displays: omit decimals if integer, show up to 2 decimal places otherwise
export function formatDisplayValue(val: unknown): string {
	if (typeof val === "function") {
		return "ƒ()";
	}
	if (typeof val !== "number") {
		return String(val);
	}
	const formatted = val.toFixed(2);
	if (formatted.endsWith(".00")) {
		return val.toString();
	}
	if (formatted.endsWith("0")) {
		return val.toFixed(1);
	}
	return formatted;
}

// Helper to clean Math namespace parameter names that overlap with user variable names
function getEvaluationContext(
	mathKeys: string[],
	argNames: string[],
	argValues: unknown[],
) {
	const cleanMathKeys: string[] = [];
	const cleanMathValues: unknown[] = [];

	for (let i = 0; i < mathKeys.length; i++) {
		const key = mathKeys[i];
		if (!argNames.includes(key)) {
			cleanMathKeys.push(key);
			cleanMathValues.push((Math as unknown as Record<string, unknown>)[key]);
		}
	}

	return {
		names: [...cleanMathKeys, ...argNames],
		values: [...cleanMathValues, ...argValues],
	};
}

// Helper to create evaluate Function instance dynamically
function compileFunctionContext(
	formulaStr: string,
	parameterNames: string[],
): (...args: unknown[]) => unknown {
	const hasReturn = /\breturn\b/.test(formulaStr);
	const functionBody = hasReturn
		? `"use strict"; ${formulaStr}`
		: `"use strict"; return (${formulaStr});`;

	return new Function(...parameterNames, functionBody) as (
		...args: unknown[]
	) => unknown;
}

// Live JS Compiler / Syntax Check
export function compileFormula(
	formulaStr: string,
	activeId: string,
	variables: Variable[],
): { error: string | null } {
	const cleanFormulaStr = formulaStr.trim();
	if (!cleanFormulaStr) {
		return { error: "Empty expression" };
	}

	if (isStaticNumber(cleanFormulaStr)) {
		return { error: null };
	}

	try {
		const mathKeys = Object.getOwnPropertyNames(Math);

		const referenced: string[] = [];
		variables.forEach((x) => {
			if (
				x.id !== activeId &&
				new RegExp(`\\b${x.id}\\b`).test(cleanFormulaStr)
			) {
				referenced.push(x.id);
			}
		});

		const mockValues = referenced.map((refId) => {
			const found = variables.find((x) => x.id === refId);
			if (found && !found.hasError && typeof found.value === "function") {
				return found.value;
			}
			const dummy = Object.assign(() => 0, {
				valueOf: () => 0,
				toString: () => "0",
			});
			return new Proxy(dummy, {
				get: (target, prop) => {
					if (prop === "valueOf" || prop === "toString") {
						return target[prop as keyof typeof target];
					}
					return dummy;
				},
				apply: () => 0,
			});
		});

		const { names, values } = getEvaluationContext(
			mathKeys,
			referenced,
			mockValues,
		);
		const fn = compileFunctionContext(cleanFormulaStr, names);
		fn(...values);

		return { error: null };
	} catch (err: unknown) {
		const message =
			err instanceof Error ? err.message : String(err || "Unknown error");
		return { error: message || "Invalid syntax" };
	}
}

// Safe equation evaluator for active board variables
export function evaluateAllVariables(variables: Variable[]) {
	const values: Record<string, unknown> = {};
	const errorVars = new Set<string>();

	// Clear all errors first
	variables.forEach((v) => {
		v.error = null;
		v.hasError = false;
	});

	function resolve(id: string, path: Set<string>): unknown {
		if (path.has(id)) {
			errorVars.add(id);
			const pathArray = Array.from(path);
			const cycleStartIdx = pathArray.indexOf(id);
			const cycle = [...pathArray.slice(cycleStartIdx), id].join(" -> ");
			throw new Error(`Circular dependency: ${cycle}`);
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
			v.error = null;
			return parsed;
		}

		path.add(id);

		try {
			const mathKeys = Object.getOwnPropertyNames(Math);

			const referenced: string[] = [];
			variables.forEach((x) => {
				if (x.id !== id && new RegExp(`\\b${x.id}\\b`).test(formulaStr)) {
					referenced.push(x.id);
				}
			});

			const resolvedVars: Record<string, unknown> = {};
			referenced.forEach((refId) => {
				const val = resolve(refId, new Set(path));
				const refVar = variables.find((x) => x.id === refId);
				if (refVar?.hasError) {
					throw new Error(`Dependency '${refId}' has error`);
				}
				resolvedVars[refId] = val;
			});

			const argNames = Object.keys(resolvedVars);
			const argValues = Object.values(resolvedVars);

			const { names, values: evalValues } = getEvaluationContext(
				mathKeys,
				argNames,
				argValues,
			);
			const fn = compileFunctionContext(formulaStr, names);
			const rawResult = fn(...evalValues);

			if (
				rawResult === null ||
				rawResult === undefined ||
				(typeof rawResult !== "number" &&
					typeof rawResult !== "function" &&
					typeof rawResult !== "string" &&
					typeof rawResult !== "boolean") ||
				(typeof rawResult === "number" &&
					(Number.isNaN(rawResult) || !Number.isFinite(rawResult)))
			) {
				throw new Error("Invalid math outcome");
			}

			values[id] = rawResult;
			v.value = rawResult;
			v.hasError = false;
			v.error = null;
			return rawResult;
		} catch (err: unknown) {
			errorVars.add(id);
			v.hasError = true;
			const message =
				err instanceof Error ? err.message : String(err || "Evaluation error");
			v.error = message;
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

	saveStateToLocalStorage();
}
