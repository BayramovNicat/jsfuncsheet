import "./style.css";
import { calculateDraggedPosition } from "./canvas";
import { evaluateAllVariables } from "./math";
import {
	getActiveBoard,
	getShowBadges,
	getShowConnections,
	saveStateToLocalStorage,
	setShowBadges,
	setShowConnections,
} from "./state";
import {
	getActiveTooltipTarget,
	hideTooltip,
	initializeTooltip,
	repositionTooltip,
	showTooltip,
} from "./tooltip";
import {
	addNewVariable,
	createNewBoard,
	drawConnections,
	getActiveDragId,
	getDragStartCard,
	getDragStartMouse,
	initializeUiSelectors,
	renderTabsList,
	renderVariables,
	setActiveDragId,
	updateBadgesVisibility,
	updateInputsDisplay,
} from "./ui";

// DOM Selectors
const inputsContainer = document.getElementById(
	"inputs-container",
) as HTMLDivElement;
const addInputBtn = document.getElementById(
	"add-input-btn",
) as HTMLButtonElement;
const boardsList = document.getElementById("boards-list") as HTMLDivElement;
const addBoardBtn = document.getElementById(
	"add-board-btn",
) as HTMLButtonElement;

// Initialize selectors in UI manager
initializeUiSelectors(inputsContainer, boardsList);

// Global Drag Mousemove coordinate updates
let dragFrameRequested = false;
let lastMouseEvent: MouseEvent | null = null;

let isSelecting = false;
let selectionStartX = 0;
let selectionStartY = 0;
let marqueeEl: HTMLDivElement | null = null;

window.addEventListener("mousedown", (e) => {
	const target = e.target as HTMLElement;

	if (e.shiftKey) {
		if (
			target.tagName === "INPUT" ||
			target.tagName === "TEXTAREA" ||
			target.closest(".btn-delete") ||
			target.closest(".btn-generate")
		) {
			return;
		}

		isSelecting = true;
		const rect = inputsContainer.getBoundingClientRect();
		selectionStartX = e.clientX - rect.left + inputsContainer.scrollLeft;
		selectionStartY = e.clientY - rect.top + inputsContainer.scrollTop;

		marqueeEl = document.createElement("div");
		marqueeEl.className = "selection-marquee";
		marqueeEl.style.left = `${selectionStartX}px`;
		marqueeEl.style.top = `${selectionStartY}px`;
		marqueeEl.style.width = "0px";
		marqueeEl.style.height = "0px";
		inputsContainer.appendChild(marqueeEl);

		e.preventDefault();
	} else {
		if (target === inputsContainer || target.id === "connections-svg") {
			document.querySelectorAll(".variable-card.selected").forEach((card) => {
				card.classList.remove("selected");
			});
		}
	}
});

window.addEventListener("mousemove", (e) => {
	if (isSelecting && marqueeEl) {
		const rect = inputsContainer.getBoundingClientRect();
		const currentX = e.clientX - rect.left + inputsContainer.scrollLeft;
		const currentY = e.clientY - rect.top + inputsContainer.scrollTop;

		const left = Math.min(selectionStartX, currentX);
		const right = Math.max(selectionStartX, currentX);
		const top = Math.min(selectionStartY, currentY);
		const bottom = Math.max(selectionStartY, currentY);

		marqueeEl.style.left = `${left}px`;
		marqueeEl.style.top = `${top}px`;
		marqueeEl.style.width = `${right - left}px`;
		marqueeEl.style.height = `${bottom - top}px`;

		const cards = inputsContainer.querySelectorAll(".variable-card");
		cards.forEach((card) => {
			const cardEl = card as HTMLDivElement;
			const cardLeft = parseFloat(cardEl.style.left);
			const cardTop = parseFloat(cardEl.style.top);
			const cardRight = cardLeft + cardEl.offsetWidth;
			const cardBottom = cardTop + cardEl.offsetHeight;

			const intersects = !(
				right <= cardLeft ||
				cardRight <= left ||
				bottom <= cardTop ||
				cardBottom <= top
			);

			if (intersects) {
				cardEl.classList.add("selected");
			} else {
				cardEl.classList.remove("selected");
			}
		});
		return;
	}

	const dragId = getActiveDragId();
	if (!dragId) return;

	lastMouseEvent = e;

	if (!dragFrameRequested) {
		dragFrameRequested = true;
		requestAnimationFrame(() => {
			dragFrameRequested = false;
			if (!lastMouseEvent) return;

			const currentDragId = getActiveDragId();
			if (!currentDragId) return;

			const activeBoard = getActiveBoard();
			const variable = activeBoard.variables.find(
				(v) => v.id === currentDragId,
			);
			const card = document.querySelector(
				`.variable-card[data-id="${currentDragId}"]`,
			) as HTMLDivElement;
			if (!variable || !card) return;

			const { startMouseX, startMouseY } = getDragStartMouse();
			const { startCardX, startCardY } = getDragStartCard();

			const snappedPos = calculateDraggedPosition(
				lastMouseEvent.clientX,
				lastMouseEvent.clientY,
				startMouseX,
				startMouseY,
				startCardX,
				startCardY,
				inputsContainer.clientWidth,
				inputsContainer.clientHeight,
			);

			variable.x = snappedPos.x;
			variable.y = snappedPos.y;

			card.style.left = `${snappedPos.x}px`;
			card.style.top = `${snappedPos.y}px`;

			// Redraw lines dynamically during drag
			drawConnections();
		});
	}
});

window.addEventListener("mouseup", () => {
	if (isSelecting) {
		isSelecting = false;
		if (marqueeEl) {
			marqueeEl.remove();
			marqueeEl = null;
		}
	}

	const dragId = getActiveDragId();
	if (dragId) {
		const card = document.querySelector(
			`.variable-card[data-id="${dragId}"]`,
		) as HTMLDivElement;
		if (card) {
			card.style.zIndex = "1";
		}
		setActiveDragId(null);
		saveStateToLocalStorage();
	}
});

window.addEventListener("keydown", (e) => {
	if (e.key === "Delete" || e.key === "Backspace") {
		const activeEl = document.activeElement;
		if (
			activeEl &&
			(activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")
		) {
			return;
		}

		const selectedCards = document.querySelectorAll(".variable-card.selected");
		if (selectedCards.length === 0) return;

		const activeBoard = getActiveBoard();
		const idsToDelete = Array.from(selectedCards).map(
			(card) => card.getAttribute("data-id")!,
		);

		const activeTT = getActiveTooltipTarget();
		if (
			activeTT &&
			idsToDelete.some((id) =>
				activeTT.closest(`.variable-card[data-id="${id}"]`),
			)
		) {
			hideTooltip();
		}

		activeBoard.variables = activeBoard.variables.filter(
			(v) => !idsToDelete.includes(v.id),
		);

		evaluateAllVariables(activeBoard.variables);
		renderVariables();
		updateInputsDisplay();
	}
});

// Sync tooltips positions on scroll events
window.addEventListener("scroll", repositionTooltip, { passive: true });
inputsContainer.addEventListener("scroll", repositionTooltip, {
	passive: true,
});

// delegated global tooltips
document.addEventListener("mouseover", (e) => {
	const target = (e.target as HTMLElement).closest(
		"[data-tooltip]",
	) as HTMLElement;
	if (target) {
		if (target.hasAttribute("title")) {
			const titleVal = target.getAttribute("title");
			if (titleVal) {
				target.setAttribute("data-original-title", titleVal);
				target.removeAttribute("title");
			}
		}
		showTooltip(target);
	}
});

document.addEventListener("mouseout", (e) => {
	const target = (e.target as HTMLElement).closest(
		"[data-tooltip]",
	) as HTMLElement;
	if (target) {
		const originalTitle = target.getAttribute("data-original-title");
		if (originalTitle) {
			target.setAttribute("title", originalTitle);
			target.removeAttribute("data-original-title");
		}
	}
	const activeTT = getActiveTooltipTarget();
	if (target && target === activeTT) {
		hideTooltip();
	}
});

// Event Bindings config
addInputBtn.addEventListener("click", () => addNewVariable());
addBoardBtn.addEventListener("click", () => createNewBoard());

const toggleLinesBtn = document.getElementById(
	"toggle-lines-btn",
) as HTMLButtonElement | null;
toggleLinesBtn?.addEventListener("click", () => {
	setShowConnections(!getShowConnections());
	drawConnections();
	renderTabsList();
});

const toggleBadgesBtn = document.getElementById(
	"toggle-badges-btn",
) as HTMLButtonElement | null;
toggleBadgesBtn?.addEventListener("click", () => {
	setShowBadges(!getShowBadges());
	updateBadgesVisibility();
	renderTabsList();
});

// Initialize elements and bootstrap render
initializeTooltip();
updateBadgesVisibility();
evaluateAllVariables(getActiveBoard().variables);
renderVariables();
updateInputsDisplay();
renderTabsList();
