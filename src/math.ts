import type { Variable } from "./types";

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

const CONTROL_KEYWORDS = new Set([
	"break",
	"case",
	"catch",
	"continue",
	"debugger",
	"default",
	"do",
	"else",
	"finally",
	"for",
	"if",
	"return",
	"switch",
	"throw",
	"try",
	"while",
	"yield",
	"await",
]);

const OTHER_KEYWORDS = new Set([
	"async",
	"class",
	"const",
	"export",
	"extends",
	"function",
	"import",
	"in",
	"instanceof",
	"let",
	"new",
	"typeof",
	"var",
	"void",
	"with",
	"true",
	"false",
	"null",
	"undefined",
]);

const BUILTIN_OBJECTS = new Set([
	"Math",
	"Number",
	"String",
	"Boolean",
	"Array",
	"Object",
	"Date",
	"RegExp",
	"JSON",
	"console",
	"window",
	"document",
	"globalThis",
	"global",
]);

interface Token {
	type:
		| "comment"
		| "string"
		| "keyword-control"
		| "keyword"
		| "number"
		| "function"
		| "builtin"
		| "operator"
		| "punctuation"
		| "property"
		| "board-variable"
		| "text";
	text: string;
	colorIndex?: number;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function tokenize(
	formula: string,
	activeId: string,
	variables: Variable[],
): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	const len = formula.length;

	while (i < len) {
		const char = formula[i];

		if (/\s/.test(char)) {
			const start = i;
			while (i < len && /\s/.test(formula[i])) {
				i++;
			}
			tokens.push({ type: "text", text: formula.slice(start, i) });
			continue;
		}

		if (char === "/" && i + 1 < len) {
			const nextChar = formula[i + 1];
			if (nextChar === "/") {
				const start = i;
				i += 2;
				while (i < len && formula[i] !== "\n" && formula[i] !== "\r") {
					i++;
				}
				tokens.push({ type: "comment", text: formula.slice(start, i) });
				continue;
			}
			if (nextChar === "*") {
				const start = i;
				i += 2;
				while (i < len) {
					if (formula[i] === "*" && i + 1 < len && formula[i + 1] === "/") {
						i += 2;
						break;
					}
					i++;
				}
				tokens.push({ type: "comment", text: formula.slice(start, i) });
				continue;
			}
		}

		if (char === '"' || char === "'" || char === "`") {
			const quote = char;
			const start = i;
			i++;
			while (i < len) {
				if (formula[i] === "\\") {
					i += 2;
				} else if (formula[i] === quote) {
					i++;
					break;
				} else {
					i++;
				}
			}
			tokens.push({ type: "string", text: formula.slice(start, i) });
			continue;
		}

		if (
			/\d/.test(char) ||
			(char === "." && i + 1 < len && /\d/.test(formula[i + 1]))
		) {
			const start = i;
			let isHex = false;
			let isOctal = false;
			let isBinary = false;

			if (char === "0" && i + 1 < len) {
				const next = formula[i + 1].toLowerCase();
				if (next === "x") {
					isHex = true;
					i += 2;
				} else if (next === "o") {
					isOctal = true;
					i += 2;
				} else if (next === "b") {
					isBinary = true;
					i += 2;
				}
			}

			if (isHex) {
				while (i < len && /[0-9a-fA-F]/.test(formula[i])) {
					i++;
				}
			} else if (isOctal) {
				while (i < len && /[0-7]/.test(formula[i])) {
					i++;
				}
			} else if (isBinary) {
				while (i < len && /[01]/.test(formula[i])) {
					i++;
				}
			} else {
				let hasDot = char === ".";
				if (char === ".") {
					i++;
				}
				while (i < len) {
					const c = formula[i];
					if (c === ".") {
						if (hasDot) break;
						if (i + 1 < len && /\d/.test(formula[i + 1])) {
							hasDot = true;
							i++;
						} else {
							break;
						}
					} else if (/\d/.test(c)) {
						i++;
					} else {
						break;
					}
				}
				if (i < len && (formula[i] === "e" || formula[i] === "E")) {
					const expStart = i;
					i++;
					if (i < len && (formula[i] === "+" || formula[i] === "-")) {
						i++;
					}
					let hasExpDigits = false;
					while (i < len && /\d/.test(formula[i])) {
						hasExpDigits = true;
						i++;
					}
					if (!hasExpDigits) {
						i = expStart;
					}
				}
			}
			tokens.push({ type: "number", text: formula.slice(start, i) });
			continue;
		}

		if (/[a-zA-Z_$]/.test(char)) {
			const start = i;
			i++;
			while (i < len && /[a-zA-Z0-9_$]/.test(formula[i])) {
				i++;
			}
			const text = formula.slice(start, i);

			let isProperty = false;
			let prevIdx = tokens.length - 1;
			while (prevIdx >= 0 && tokens[prevIdx].type === "text") {
				prevIdx--;
			}
			if (prevIdx >= 0 && tokens[prevIdx].text === ".") {
				isProperty = true;
			}

			let lookahead = i;
			while (lookahead < len && /\s/.test(formula[lookahead])) {
				lookahead++;
			}
			const isFunctionCall = lookahead < len && formula[lookahead] === "(";

			if (isProperty) {
				if (isFunctionCall) {
					tokens.push({ type: "function", text });
				} else {
					tokens.push({ type: "property", text });
				}
			} else {
				const foundVar = variables.find((x) => x.id === text);
				if (foundVar && foundVar.id !== activeId) {
					tokens.push({
						type: "board-variable",
						text,
						colorIndex: foundVar.colorIndex ?? 1,
					});
				} else if (CONTROL_KEYWORDS.has(text)) {
					tokens.push({ type: "keyword-control", text });
				} else if (OTHER_KEYWORDS.has(text)) {
					tokens.push({ type: "keyword", text });
				} else if (BUILTIN_OBJECTS.has(text)) {
					tokens.push({ type: "builtin", text });
				} else if (isFunctionCall) {
					tokens.push({ type: "function", text });
				} else {
					tokens.push({ type: "text", text });
				}
			}
			continue;
		}

		if (char === "." || char === "," || char === ";" || char === ":") {
			tokens.push({ type: "punctuation", text: char });
			i++;
			continue;
		}

		if (/[+\-*/%=&|^<>!~?(){}[\]]/.test(char)) {
			const start = i;
			i++;
			if (!/[(){}[\]]/.test(char)) {
				while (
					i < len &&
					/[+\-*/%=&|^<>!~?]/.test(formula[i]) &&
					!/[(){}[\]]/.test(formula[i])
				) {
					i++;
				}
			}
			tokens.push({ type: "operator", text: formula.slice(start, i) });
			continue;
		}

		tokens.push({ type: "text", text: char });
		i++;
	}

	return tokens;
}

// Escapes HTML tags and highlights syntax variables with colors (hl-1 to hl-5)
export function syntaxHighlight(
	formula: string,
	activeId: string,
	variables: Variable[],
): string {
	const tokens = tokenize(formula, activeId, variables);

	return tokens
		.map((token) => {
			const escaped = escapeHtml(token.text);
			switch (token.type) {
				case "comment":
					return `<span class="js-comment">${escaped}</span>`;
				case "string":
					return `<span class="js-string">${escaped}</span>`;
				case "keyword-control":
					return `<span class="js-keyword-control">${escaped}</span>`;
				case "keyword":
					return `<span class="js-keyword">${escaped}</span>`;
				case "builtin":
					return `<span class="js-builtin">${escaped}</span>`;
				case "number":
					return `<span class="js-number">${escaped}</span>`;
				case "function":
					return `<span class="js-function">${escaped}</span>`;
				case "property":
					return `<span class="js-property">${escaped}</span>`;
				case "operator":
					return `<span class="js-operator">${escaped}</span>`;
				case "punctuation":
					return `<span class="js-punctuation">${escaped}</span>`;
				case "board-variable":
					return `<span class="hl-${token.colorIndex}">${escaped}</span>`;
				default:
					return escaped;
			}
		})
		.join("");
}

// Safe equation evaluator for active board variables
export function evaluateAllVariables(variables: Variable[]) {
	const values: Record<string, unknown> = {};
	const errorVars = new Set<string>();

	function resolve(id: string, path: Set<string>): unknown {
		if (path.has(id)) {
			errorVars.add(id);
			throw new Error("Circular dependency");
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

			const referenced: string[] = [];
			variables.forEach((x) => {
				if (x.id !== id && new RegExp(`\\b${x.id}\\b`).test(formulaStr)) {
					referenced.push(x.id);
				}
			});

			const resolvedVars: Record<string, unknown> = {};
			referenced.forEach((refId) => {
				resolvedVars[refId] = resolve(refId, new Set(path));
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
