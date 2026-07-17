import type { Board } from "./types";
import { LAYOUT_CONFIG } from "./types";

// Default seeded template boards data
let boards: Board[] = [
	{
		id: "compound",
		name: "Compound Interest Calculator",
		variables: [
			{
				id: "A",
				label: "Initial Principal",
				formula: "1000",
				value: 1000,
				hasError: false,
				x: 20,
				y: 20,
			},
			{
				id: "B",
				label: "Years",
				formula: "5",
				value: 5,
				hasError: false,
				x: 20,
				y: 100,
			},
			{
				id: "C",
				label: "Annual Rate %",
				formula: "8",
				value: 8,
				hasError: false,
				x: 20,
				y: 180,
			},
			{
				id: "D",
				label: "Compounding / Year",
				formula: "12",
				value: 12,
				hasError: false,
				x: 20,
				y: 260,
			},
			{
				id: "E",
				label: "Future Value",
				formula:
					"let total = A;\nconst periods = B * D;\nconst rate = (C / 100) / D;\nfor (let i = 0; i < periods; i++) {\n    total = total * (1 + rate);\n}\nreturn total;",
				value: 1489.8457083017415,
				hasError: false,
				x: 280,
				y: 20,
			},
		],
	},
	{
		id: "grades",
		name: "Student Grade Tracker",
		variables: [
			{
				id: "A",
				label: "Homework Score",
				formula: "85",
				value: 85,
				hasError: false,
				x: 20,
				y: 20,
			},
			{
				id: "B",
				label: "Exam Score",
				formula: "75",
				value: 75,
				hasError: false,
				x: 20,
				y: 100,
			},
			{
				id: "C",
				label: "Project Score",
				formula: "90",
				value: 90,
				hasError: false,
				x: 20,
				y: 180,
			},
			{
				id: "D",
				label: "Weighted Score",
				formula: "A * 0.3 + B * 0.4 + C * 0.3",
				value: 82.5,
				hasError: false,
				x: 280,
				y: 20,
			},
			{
				id: "E",
				label: "Letter Grade",
				formula:
					"const score = D;\nif (score >= 90) return 'A';\nif (score >= 80) return 'B';\nif (score >= 70) return 'C';\nif (score >= 60) return 'D';\nreturn 'F';",
				value: "B",
				hasError: false,
				x: 280,
				y: 100,
			},
		],
	},
];

let activeBoardId = "compound";

export function getBoards(): Board[] {
	return boards;
}

export function saveStateToLocalStorage() {
	try {
		localStorage.setItem("excell_boards", JSON.stringify(boards));
		localStorage.setItem("excell_active_board_id", activeBoardId);
	} catch (e) {
		console.error("Failed to save state to localStorage", e);
	}
}

export function loadStateFromLocalStorage() {
	try {
		const storedBoards = localStorage.getItem("excell_boards");
		const storedActiveId = localStorage.getItem("excell_active_board_id");
		if (storedBoards) {
			boards = JSON.parse(storedBoards);
		}
		if (storedActiveId) {
			activeBoardId = storedActiveId;
		}
	} catch (e) {
		console.error("Failed to load state from localStorage", e);
	}
}

// Auto-load state on module initialization
loadStateFromLocalStorage();

export function setBoards(newBoards: Board[]) {
	boards = newBoards;
	saveStateToLocalStorage();
}

export function getActiveBoardId(): string {
	return activeBoardId;
}

export function setActiveBoardId(id: string) {
	activeBoardId = id;
	saveStateToLocalStorage();
}

export function getUniqueColorIndex(
	variables: { colorIndex?: number }[],
): number {
	const used = new Set(
		variables.map((v) => v.colorIndex).filter((c) => c !== undefined),
	);
	for (let i = 1; i <= 10; i++) {
		if (!used.has(i)) {
			return i;
		}
	}
	return (variables.length % 10) + 1;
}

export function getActiveBoard(): Board {
	const board = boards.find((x) => x.id === activeBoardId) ?? boards[0];
	board.variables.forEach((v) => {
		if (v.colorIndex === undefined) {
			v.colorIndex = getUniqueColorIndex(
				board.variables.filter((x) => x !== v && x.colorIndex !== undefined),
			);
		}
	});
	return board;
}

// Generate next available single/double letter Variable ID
export function generateNextId(): string {
	const activeBoard = getActiveBoard();
	const alphabet = LAYOUT_CONFIG.ALPHABET;
	const existingIds = activeBoard.variables.map((v) => v.id);

	for (let i = 0; i < alphabet.length; i++) {
		if (!existingIds.includes(alphabet[i])) {
			return alphabet[i];
		}
	}

	let index = 1;
	while (true) {
		for (let i = 0; i < alphabet.length; i++) {
			const candidate = `${alphabet[i]}${index}`;
			if (!existingIds.includes(candidate)) {
				return candidate;
			}
		}
		index++;
	}
}

// Staging class overrides for referenced cards in active formula
export function updateCardHighlights(activeId: string, formulaStr: string) {
	clearCardHighlights();

	const activeBoard = getActiveBoard();
	const sortedVars = [...activeBoard.variables]
		.filter((x) => x.id !== activeId)
		.sort((a, b) => b.id.length - a.id.length);

	const refIds = sortedVars
		.filter((x) => new RegExp(`\\b${x.id}\\b`).test(formulaStr))
		.map((x) => x.id);

	refIds.forEach((id) => {
		const found = activeBoard.variables.find((x) => x.id === id);
		const cardEl = document.querySelector(`.variable-card[data-id="${id}"]`);
		if (cardEl && found) {
			cardEl.classList.add(`card-hl-${found.colorIndex}`);
		}
	});
}

export function clearCardHighlights() {
	document.querySelectorAll(".variable-card").forEach((card) => {
		card.classList.remove(
			"card-hl-1",
			"card-hl-2",
			"card-hl-3",
			"card-hl-4",
			"card-hl-5",
			"card-hl-6",
			"card-hl-7",
			"card-hl-8",
			"card-hl-9",
			"card-hl-10",
		);
	});
}
