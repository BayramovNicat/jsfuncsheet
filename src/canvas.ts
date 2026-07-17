import type { Variable } from "./types";
import { LAYOUT_CONFIG } from "./types";

// Find first vacant position (scanning vertically within visible bounds, then shifting horizontally, and finally going deeper)
export function findVacantPosition(
	variables: Variable[],
	containerWidth: number,
	containerHeight: number,
): { x: number; y: number } {
	const cardWidth = LAYOUT_CONFIG.CARD_WIDTH;
	const cardHeight = LAYOUT_CONFIG.CARD_HEIGHT;
	const activeHeight = containerHeight - LAYOUT_CONFIG.FOOTER_HEIGHT;

	const bboxes = variables.map((v) => ({
		left: v.x,
		right: v.x + cardWidth,
		top: v.y,
		bottom: v.y + cardHeight,
	}));

	// Phase 1: Scan vertically down column 1, then column 2, etc. (strictly inside visible screen space)
	for (
		let x = LAYOUT_CONFIG.MARGIN;
		x < containerWidth - cardWidth + LAYOUT_CONFIG.MARGIN;
		x += LAYOUT_CONFIG.COL_PITCH
	) {
		for (
			let y = LAYOUT_CONFIG.MARGIN;
			y < activeHeight - cardHeight;
			y += LAYOUT_CONFIG.ROW_PITCH
		) {
			const overlaps = bboxes.some((b) => {
				return !(
					x + cardWidth <= b.left ||
					b.right <= x ||
					y + cardHeight <= b.top ||
					b.bottom <= y
				);
			});
			if (!overlaps) {
				return { x, y };
			}
		}
	}

	// Phase 2: If the entire visible grid is fully occupied, start placing cards below the fold row-by-row
	const startY = Math.max(
		LAYOUT_CONFIG.MARGIN,
		Math.floor((activeHeight - cardHeight) / LAYOUT_CONFIG.ROW_PITCH) *
			LAYOUT_CONFIG.ROW_PITCH +
			LAYOUT_CONFIG.MARGIN,
	);
	for (
		let y = startY;
		y < LAYOUT_CONFIG.CANVAS_MAX_DEPTH - cardHeight;
		y += LAYOUT_CONFIG.ROW_PITCH
	) {
		for (
			let x = LAYOUT_CONFIG.MARGIN;
			x < containerWidth - cardWidth + LAYOUT_CONFIG.MARGIN;
			x += LAYOUT_CONFIG.COL_PITCH
		) {
			const overlaps = bboxes.some((b) => {
				return !(
					x + cardWidth <= b.left ||
					b.right <= x ||
					y + cardHeight <= b.top ||
					b.bottom <= y
				);
			});
			if (!overlaps) {
				return { x, y };
			}
		}
	}

	return { x: LAYOUT_CONFIG.MARGIN, y: LAYOUT_CONFIG.MARGIN };
}

// Snap coordinates to 20px grid and keep within drag bounds
export function calculateDraggedPosition(
	clientX: number,
	clientY: number,
	startMouseX: number,
	startMouseY: number,
	startCardX: number,
	startCardY: number,
	containerWidth: number,
	containerHeight: number,
	cardWidth = LAYOUT_CONFIG.CARD_WIDTH,
	cardHeight = LAYOUT_CONFIG.CARD_HEIGHT,
): { x: number; y: number } {
	const dx = clientX - startMouseX;
	const dy = clientY - startMouseY;

	let newX = startCardX + dx;
	let newY = startCardY + dy;

	const maxX = containerWidth - cardWidth;
	const maxY = containerHeight - cardHeight;

	newX = Math.max(0, Math.min(newX, maxX));
	newY = Math.max(0, Math.min(newY, maxY));

	const snappedX =
		Math.round(newX / LAYOUT_CONFIG.SNAP_GRID) * LAYOUT_CONFIG.SNAP_GRID;
	const snappedY =
		Math.round(newY / LAYOUT_CONFIG.SNAP_GRID) * LAYOUT_CONFIG.SNAP_GRID;

	return { x: snappedX, y: snappedY };
}
