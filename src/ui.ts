import { findVacantPosition } from "./canvas";
import { syntaxHighlight } from "./highlight";
import {
	compileFormula,
	evaluateAllVariables,
	formatDisplayValue,
	isStaticNumber,
} from "./math";
import {
	clearCardHighlights,
	generateNextId,
	getActiveBoard,
	getActiveBoardId,
	getBoards,
	saveStateToLocalStorage,
	setActiveBoardId,
	setBoards,
	updateCardHighlights,
} from "./state";
import { getActiveTooltipTarget, hideTooltip, showTooltip } from "./tooltip";
import { type Board, LAYOUT_CONFIG, type Variable } from "./types";

let activeDragId: string | null = null;
let startMouseX = 0;
let startMouseY = 0;
let startCardX = 0;
let startCardY = 0;

export function getActiveDragId(): string | null {
	return activeDragId;
}

export function setActiveDragId(id: string | null) {
	activeDragId = id;
}

export function setDragCoordinates(
	mouseX: number,
	mouseY: number,
	cardX: number,
	cardY: number,
) {
	startMouseX = mouseX;
	startMouseY = mouseY;
	startCardX = cardX;
	startCardY = cardY;
}

export function getDragStartMouse() {
	return { startMouseX, startMouseY };
}

export function getDragStartCard() {
	return { startCardX, startCardY };
}

// Selectors helper
let inputsContainer: HTMLDivElement;
let boardsList: HTMLDivElement;

export function clearNavigationHighlights() {
	if (inputsContainer) {
		inputsContainer.classList.remove("highlighting-target");
	}
	document
		.querySelectorAll(".variable-card.navigation-highlight")
		.forEach((card) => {
			card.classList.remove("navigation-highlight");
		});
}

export function initializeUiSelectors(
	inputs: HTMLDivElement,
	boards: HTMLDivElement,
) {
	inputsContainer = inputs;
	boardsList = boards;

	window.addEventListener("keydown", (e) => {
		if (e.key === "Meta" || e.key === "Control") {
			document.body.classList.add("cmd-pressed");
		}
	});

	window.addEventListener("keyup", (e) => {
		if (e.key === "Meta" || e.key === "Control") {
			document.body.classList.remove("cmd-pressed");
			clearNavigationHighlights();
		}
	});

	window.addEventListener("blur", () => {
		document.body.classList.remove("cmd-pressed");
		clearNavigationHighlights();
	});
}

// Updates the display value and errors of blurred inputs
export function updateInputsDisplay(): void {
	const activeBoard = getActiveBoard();
	activeBoard.variables.forEach((v) => {
		const inputEl = document.querySelector(
			`.var-value-input[data-id="${v.id}"]`,
		) as HTMLTextAreaElement;
		if (!inputEl || document.activeElement === inputEl) return;

		if (v.hasError) {
			inputEl.value = "Error";
			inputEl.classList.add("calc-error");
			inputEl.setAttribute(
				"data-tooltip",
				`⚠️ ${v.error || "Evaluation error"}`,
			);
		} else {
			inputEl.value = formatDisplayValue(v.value);
			inputEl.classList.remove("calc-error");
			inputEl.removeAttribute("data-tooltip");
		}
	});
}

// Auto size textareas
export function autoSizeTextarea(inputEl: HTMLTextAreaElement): void {
	inputEl.style.height = "auto";
	const calculatedHeight = Math.max(
		LAYOUT_CONFIG.CARD_HEIGHT - 36,
		Math.min(inputEl.scrollHeight, LAYOUT_CONFIG.MAX_VAL_INPUT_HEIGHT),
	);
	inputEl.style.height = `${calculatedHeight}px`;

	const lines = inputEl.value.split("\n");
	const maxLineLength = Math.max(...lines.map((line) => line.length));
	const calculatedWidth = Math.max(
		LAYOUT_CONFIG.MIN_VAL_INPUT_WIDTH,
		(maxLineLength + 4) * LAYOUT_CONFIG.CHAR_WIDTH,
	);
	inputEl.style.width = `${calculatedWidth}px`;

	const cardEl = inputEl.closest(".variable-card");
	if (cardEl) {
		const overlayEl = cardEl.querySelector(
			".value-highlight-overlay",
		) as HTMLDivElement;
		if (overlayEl) {
			overlayEl.style.width = `${calculatedWidth}px`;
			overlayEl.style.height = `${calculatedHeight}px`;
		}
	}
}

// Add a single variable entry
export function addNewVariable(): void {
	const activeBoard = getActiveBoard();
	const nextId = generateNextId();
	const pos = findVacantPosition(
		activeBoard.variables,
		inputsContainer.clientWidth,
		inputsContainer.clientHeight,
	);

	activeBoard.variables.push({
		id: nextId,
		label: `Variable ${nextId}`,
		formula: "10",
		value: 10,
		hasError: false,
		x: pos.x,
		y: pos.y,
	});

	renderVariables();
	evaluateAllVariables(activeBoard.variables);
	updateInputsDisplay();
}

// Delete variable card State mutation
export function deleteVariable(id: string): void {
	const activeBoard = getActiveBoard();
	const activeTT = getActiveTooltipTarget();

	if (activeTT?.closest(`.variable-card[data-id="${id}"]`)) {
		hideTooltip();
	}
	activeBoard.variables = activeBoard.variables.filter((v) => v.id !== id);
	renderVariables();
	evaluateAllVariables(activeBoard.variables);
	updateInputsDisplay();
}

// Insert Variable ID at active textarea caret
export function insertBadgeId(id: string): void {
	const activeBoard = getActiveBoard();
	const active = document.activeElement as HTMLTextAreaElement | null;
	if (!active?.classList.contains("var-value-input")) return;

	const varId = active.getAttribute("data-id");
	const variable = activeBoard.variables.find((v) => v.id === varId);
	if (!variable || variable.id === id) return;

	const start = active.selectionStart ?? active.value.length;
	const end = active.selectionEnd ?? active.value.length;
	const oldVal = active.value;

	active.value = oldVal.substring(0, start) + id + oldVal.substring(end);
	variable.formula = active.value;

	const newPos = start + id.length;
	active.setSelectionRange(newPos, newPos);

	autoSizeTextarea(active);

	const cardEl = active.closest(".variable-card");
	if (cardEl) {
		const overlayEl = cardEl.querySelector(
			".value-highlight-overlay",
		) as HTMLDivElement;
		if (overlayEl) {
			overlayEl.innerHTML = syntaxHighlight(
				active.value,
				variable.id,
				activeBoard.variables,
			);
			overlayEl.scrollLeft = active.scrollLeft;
			overlayEl.scrollTop = active.scrollTop;
		}
	}

	updateCardHighlights(variable.id, active.value);

	const check = compileFormula(
		active.value,
		variable.id,
		activeBoard.variables,
	);
	if (check.error) {
		active.setAttribute("data-tooltip", `⚠️ ${check.error}`);
		active.classList.add("calc-error");
		showTooltip(active);
	} else {
		active.removeAttribute("data-tooltip");
		active.classList.remove("calc-error");
		hideTooltip();
	}

	evaluateAllVariables(activeBoard.variables);
	updateInputsDisplay();
}

// Separate listener hooks definition for variables (reduces nesting size in render)
function bindVariableCardEvents(
	card: HTMLDivElement,
	variable: Variable,
	activeBoard: Board,
	labelSpan: HTMLSpanElement,
	valInput: HTMLTextAreaElement,
	overlayEl: HTMLDivElement,
	deleteBtn: HTMLButtonElement,
	badgeBtn: HTMLDivElement,
) {
	// Drag handling
	card.addEventListener("mousedown", (e) => {
		const target = e.target as HTMLElement;
		if (
			target.tagName === "INPUT" ||
			target.tagName === "TEXTAREA" ||
			target.classList.contains("btn-delete") ||
			target.tagName === "svg" ||
			target.tagName === "path"
		) {
			return;
		}

		e.preventDefault();
		activeDragId = variable.id;
		startMouseX = e.clientX;
		startMouseY = e.clientY;
		startCardX = variable.x;
		startCardY = variable.y;
		card.style.zIndex = "50";
	});

	// Rename label
	labelSpan.addEventListener("dblclick", () => {
		const input = document.createElement("input");
		input.type = "text";
		input.className = "var-label-input";
		input.value = variable.label;

		const saveLabel = () => {
			variable.label = input.value.trim() || `Variable ${variable.id}`;
			renderVariables();
			updateInputsDisplay();
			saveStateToLocalStorage();
		};

		input.addEventListener("blur", saveLabel);
		input.addEventListener("keydown", (ev) => {
			if (ev.key === "Enter") {
				input.blur();
			}
		});

		labelSpan.replaceWith(input);
		input.focus();
		input.select();
	});

	badgeBtn.addEventListener("mousedown", (e) => {
		const active = document.activeElement;
		if (active?.classList.contains("var-value-input")) {
			e.preventDefault();
			insertBadgeId(variable.id);
		}
	});

	valInput.addEventListener("scroll", () => {
		overlayEl.scrollLeft = valInput.scrollLeft;
		overlayEl.scrollTop = valInput.scrollTop;
	});

	overlayEl.addEventListener("click", (e) => {
		const target = e.target as HTMLElement;
		if (target?.className.includes("hl-")) {
			const varId = target.textContent?.trim();
			if (varId) {
				const targetInput = document.querySelector(
					`.var-value-input[data-id="${varId}"]`,
				) as HTMLTextAreaElement | null;
				if (targetInput) {
					targetInput.focus();
				}
			}
		}
	});

	overlayEl.addEventListener("mouseover", (e) => {
		if (!document.body.classList.contains("cmd-pressed")) return;
		const target = e.target as HTMLElement;
		if (target?.className.includes("hl-")) {
			const varId = target.textContent?.trim();
			if (varId) {
				document
					.querySelectorAll(".variable-card.navigation-highlight")
					.forEach((card) => {
						card.classList.remove("navigation-highlight");
					});
				inputsContainer.classList.add("highlighting-target");
				const targetCard = document.querySelector(
					`.variable-card[data-id="${varId}"]`,
				) as HTMLElement | null;
				if (targetCard) {
					targetCard.classList.add("navigation-highlight");
				}
			}
		}
	});

	overlayEl.addEventListener("mouseout", (e) => {
		const target = e.target as HTMLElement;
		if (target?.className.includes("hl-")) {
			const related = e.relatedTarget as HTMLElement;
			if (!related?.className.includes("hl-")) {
				inputsContainer.classList.remove("highlighting-target");
				document
					.querySelectorAll(".variable-card.navigation-highlight")
					.forEach((card) => {
						card.classList.remove("navigation-highlight");
					});
			}
		}
	});

	valInput.addEventListener("focus", () => {
		valInput.value = variable.formula;
		valInput.classList.remove("calc-error");
		autoSizeTextarea(valInput);
		requestAnimationFrame(() => {
			autoSizeTextarea(valInput);
		});

		overlayEl.style.display = "block";
		overlayEl.innerHTML = syntaxHighlight(
			valInput.value,
			variable.id,
			activeBoard.variables,
		);
		overlayEl.scrollLeft = valInput.scrollLeft;
		overlayEl.scrollTop = valInput.scrollTop;

		updateCardHighlights(variable.id, valInput.value);

		const check = compileFormula(
			valInput.value,
			variable.id,
			activeBoard.variables,
		);
		if (check.error) {
			valInput.setAttribute("data-tooltip", `⚠️ ${check.error}`);
			valInput.classList.add("calc-error");
			showTooltip(valInput);
		} else {
			valInput.removeAttribute("data-tooltip");
			valInput.classList.remove("calc-error");
		}
	});

	valInput.addEventListener("blur", () => {
		valInput.style.width = "";
		valInput.style.height = "";
		valInput.removeAttribute("data-tooltip");
		overlayEl.style.width = "";
		overlayEl.style.height = "";
		overlayEl.style.display = "none";
		clearCardHighlights();
		hideTooltip();

		evaluateAllVariables(activeBoard.variables);
		updateInputsDisplay();
	});

	const triggerInputUpdate = () => {
		variable.formula = valInput.value;
		autoSizeTextarea(valInput);

		overlayEl.innerHTML = syntaxHighlight(
			valInput.value,
			variable.id,
			activeBoard.variables,
		);
		overlayEl.scrollLeft = valInput.scrollLeft;
		overlayEl.scrollTop = valInput.scrollTop;

		updateCardHighlights(variable.id, valInput.value);

		const check = compileFormula(
			valInput.value,
			variable.id,
			activeBoard.variables,
		);
		if (check.error) {
			valInput.setAttribute("data-tooltip", `⚠️ ${check.error}`);
			valInput.classList.add("calc-error");
			showTooltip(valInput);
		} else {
			valInput.removeAttribute("data-tooltip");
			valInput.classList.remove("calc-error");
			hideTooltip();
		}

		evaluateAllVariables(activeBoard.variables);
		updateInputsDisplay();
	};

	valInput.addEventListener("input", triggerInputUpdate);

	valInput.addEventListener("keydown", (e) => {
		if (e.key === "ArrowUp" || e.key === "ArrowDown") {
			const isNum = isStaticNumber(valInput.value);
			if (isNum) {
				e.preventDefault();
				let val = parseFloat(valInput.value);
				if (Number.isNaN(val)) val = 0;

				const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
				val += e.key === "ArrowUp" ? step : -step;

				valInput.value = parseFloat(val.toFixed(4)).toString();
				triggerInputUpdate();
			}
			return;
		}

		const PAIRS: Record<string, string> = {
			"{": "}",
			"[": "]",
			"(": ")",
			'"': '"',
			"'": "'",
			"`": "`",
		};
		const CLOSE_CHARS = new Set(["}", "]", ")", '"', "'", "`"]);

		const start = valInput.selectionStart ?? 0;
		const end = valInput.selectionEnd ?? 0;
		const val = valInput.value;

		if (PAIRS[e.key] !== undefined) {
			e.preventDefault();
			const openChar = e.key;
			const closeChar = PAIRS[openChar];

			if (
				(openChar === '"' || openChar === "'" || openChar === "`") &&
				start === end &&
				val[start] === openChar
			) {
				valInput.setSelectionRange(start + 1, start + 1);
				return;
			}

			if (start !== end) {
				const selected = val.substring(start, end);
				valInput.value =
					val.substring(0, start) +
					openChar +
					selected +
					closeChar +
					val.substring(end);
				valInput.setSelectionRange(start + 1, end + 1);
			} else {
				valInput.value =
					val.substring(0, start) + openChar + closeChar + val.substring(start);
				valInput.setSelectionRange(start + 1, start + 1);
			}
			triggerInputUpdate();
			return;
		}

		if (CLOSE_CHARS.has(e.key) && start === end && val[start] === e.key) {
			e.preventDefault();
			valInput.setSelectionRange(start + 1, start + 1);
			return;
		}

		if (e.key === "Backspace" && start === end && start > 0) {
			const prevChar = val[start - 1];
			const nextChar = val[start];
			if (PAIRS[prevChar] === nextChar) {
				e.preventDefault();
				valInput.value = `${val.substring(0, start - 1)}${val.substring(start + 1)}`;
				valInput.setSelectionRange(start - 1, start - 1);
				triggerInputUpdate();
				return;
			}
		}

		if (e.key === "Tab") {
			e.preventDefault();
			if (!e.shiftKey) {
				valInput.value = `${val.substring(0, start)}    ${val.substring(end)}`;
				valInput.setSelectionRange(start + 4, start + 4);
			} else {
				if (start === end && start > 0) {
					if (val.substring(start - 4, start) === "    ") {
						valInput.value = `${val.substring(0, start - 4)}${val.substring(start)}`;
						valInput.setSelectionRange(start - 4, start - 4);
					} else if (val[start - 1] === "\t") {
						valInput.value = `${val.substring(0, start - 1)}${val.substring(start)}`;
						valInput.setSelectionRange(start - 1, start - 1);
					}
				}
			}
			triggerInputUpdate();
			return;
		}

		if (e.key === "Enter") {
			const beforeCursor = val.substring(0, start);
			const lineStartIdx = beforeCursor.lastIndexOf("\n") + 1;
			const currentLine = beforeCursor.substring(lineStartIdx);
			const whitespaceMatch = currentLine.match(/^\s*/);
			const leadingWhitespace = whitespaceMatch ? whitespaceMatch[0] : "";

			const lastChar = currentLine.trim().slice(-1);
			const charAfter = val[start];

			if (
				(lastChar === "{" && charAfter === "}") ||
				(lastChar === "[" && charAfter === "]") ||
				(lastChar === "(" && charAfter === ")")
			) {
				e.preventDefault();
				const indent = `${leadingWhitespace}    `;
				valInput.value = `${val.substring(0, start)}\n${indent}\n${leadingWhitespace}${val.substring(start)}`;
				const newPos = start + 1 + indent.length;
				valInput.setSelectionRange(newPos, newPos);
				triggerInputUpdate();
				return;
			}

			if (
				lastChar === "{" ||
				lastChar === "[" ||
				lastChar === "(" ||
				val.includes("\n") ||
				e.shiftKey
			) {
				e.preventDefault();
				const indent = `${leadingWhitespace}${
					lastChar === "{" || lastChar === "[" || lastChar === "(" ? "    " : ""
				}`;
				valInput.value = `${val.substring(0, start)}\n${indent}${val.substring(start)}`;
				const newPos = start + 1 + indent.length;
				valInput.setSelectionRange(newPos, newPos);
				triggerInputUpdate();
				return;
			}

			if (!e.shiftKey) {
				e.preventDefault();
				valInput.blur();
			}
		}

		if (e.key === "Escape") {
			valInput.blur();
		}
	});

	deleteBtn.addEventListener("click", () => deleteVariable(variable.id));
}

// Render dynamic card entries
export function renderVariables(): void {
	const activeBoard = getActiveBoard();
	inputsContainer.innerHTML = "";

	activeBoard.variables.forEach((variable) => {
		const card = document.createElement("div");
		card.className = "variable-card";
		card.setAttribute("data-id", variable.id);
		card.style.left = `${variable.x}px`;
		card.style.top = `${variable.y}px`;

		const displayVal = variable.hasError
			? "Error"
			: formatDisplayValue(variable.value);

		const errAttr = variable.hasError
			? ` data-tooltip="⚠️ ${variable.error || "Evaluation error"}" class="var-value-input calc-error"`
			: ' class="var-value-input"';

		card.innerHTML = `
      <div class="variable-card-row">
        <div class="field-group">
          <div class="var-title-row">
            <div class="var-title-left">
              <span class="variable-badge" data-badge-id="${variable.id}" data-tooltip="Insert ${variable.id}">${variable.id}</span>
              <span class="var-label-span">${variable.label}</span>
            </div>
            <button class="btn-delete" data-tooltip="Delete Variable" aria-label="Delete">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
          <div class="var-value-wrapper">
            <textarea${errAttr} data-id="${variable.id}" spellcheck="false" autocomplete="off" rows="1">${displayVal}</textarea>
            <div class="value-highlight-overlay" data-id="${variable.id}"></div>
          </div>
        </div>
      </div>
    `;

		const labelSpan = card.querySelector(".var-label-span") as HTMLSpanElement;
		const valInput = card.querySelector(
			".var-value-input",
		) as HTMLTextAreaElement;
		const overlayEl = card.querySelector(
			".value-highlight-overlay",
		) as HTMLDivElement;
		const deleteBtn = card.querySelector(".btn-delete") as HTMLButtonElement;
		const badgeBtn = card.querySelector(".variable-badge") as HTMLDivElement;

		// Bind event hooks cleanly
		bindVariableCardEvents(
			card,
			variable,
			activeBoard,
			labelSpan,
			valInput,
			overlayEl,
			deleteBtn,
			badgeBtn,
		);

		inputsContainer.appendChild(card);
	});
}
// Render the bottom board toggler tabs
export function renderTabsList(): void {
	boardsList.innerHTML = "";
	const boards = getBoards();
	const activeBoardId = getActiveBoardId();

	boards.forEach((board) => {
		const tab = document.createElement("div");
		tab.className = `board-tab ${board.id === activeBoardId ? "active" : ""}`;

		// Switch active board on click
		tab.addEventListener("click", (e) => {
			const target = e.target as HTMLElement;
			if (target.closest(".btn-tab-close") || target.tagName === "INPUT") {
				return;
			}
			if (getActiveBoardId() === board.id) {
				return;
			}
			setActiveBoardId(board.id);
			renderTabsList();
			renderVariables();
			evaluateAllVariables(getActiveBoard().variables);
			updateInputsDisplay();
		});

		// Double click to rename tab inline
		tab.addEventListener("dblclick", () => {
			const span = tab.querySelector(".board-tab-name-span") as HTMLSpanElement;
			if (!span) return;

			const input = document.createElement("input");
			input.type = "text";
			input.className = "board-tab-name-input";
			input.value = board.name;

			const saveName = () => {
				board.name = input.value.trim() || "Untitled Board";
				renderTabsList();
			};

			input.addEventListener("blur", saveName);
			input.addEventListener("keydown", (ev) => {
				if (ev.key === "Enter") {
					input.blur();
				}
			});

			span.replaceWith(input);
			input.focus();
			input.select();
		});

		tab.innerHTML = `
      <span class="board-tab-name-span">${board.name}</span>
      <button class="btn-tab-close" data-tooltip="Close Board" aria-label="Close">
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;

		const closeBtn = tab.querySelector(".btn-tab-close") as HTMLButtonElement;
		closeBtn.addEventListener("click", () => {
			const allBoards = getBoards();
			if (allBoards.length <= 1) {
				alert("You must keep at least one board!");
				return;
			}

			const confirmClose = confirm(
				`Are you sure you want to delete "${board.name}"?`,
			);
			if (confirmClose) {
				const remaining = allBoards.filter((x) => x.id !== board.id);
				setBoards(remaining);
				if (getActiveBoardId() === board.id) {
					setActiveBoardId(remaining[0].id);
				}
				renderTabsList();
				renderVariables();
				evaluateAllVariables(getActiveBoard().variables);
				updateInputsDisplay();
			}
		});

		boardsList.appendChild(tab);
	});
}

export function createNewBoard(): void {
	const allBoards = getBoards();
	const newId = `board-${Date.now()}`;
	const newName = `Board ${allBoards.length + 1}`;

	allBoards.push({
		id: newId,
		name: newName,
		variables: [
			{
				id: "A",
				label: "Item 1",
				formula: "10",
				value: 10,
				hasError: false,
				x: 20,
				y: 20,
			},
		],
	});

	setActiveBoardId(newId);
	renderTabsList();
	renderVariables();
	evaluateAllVariables(getActiveBoard().variables);
	updateInputsDisplay();
}
