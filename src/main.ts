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

window.addEventListener("mousemove", (e) => {
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
