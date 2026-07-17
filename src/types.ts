export interface Variable {
	id: string; // Unique Identifier (e.g., A, B, C)
	label: string; // Friendly display label
	formula: string; // Underlying formula (e.g., "A * B" or "100")
	value: number; // Calculated value
	hasError: boolean;
	x: number; // absolute X position on canvas
	y: number; // absolute Y position on canvas
}

export interface Board {
	id: string;
	name: string;
	variables: Variable[];
}

export const LAYOUT_CONFIG = {
	CARD_WIDTH: 240,
	CARD_HEIGHT: 60,
	COL_PITCH: 260,
	ROW_PITCH: 80,
	SNAP_GRID: 20,
	MARGIN: 20,
	FOOTER_HEIGHT: 48,
	CANVAS_MAX_DEPTH: 5000,
	CHAR_WIDTH: 9.5,
	MIN_VAL_INPUT_WIDTH: 214,
	MAX_VAL_INPUT_HEIGHT: 300,
	ALPHABET: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
} as const;
