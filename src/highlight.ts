import type { Variable } from "./types";

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

// Escapes HTML tags and highlights syntax variables with colors
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
