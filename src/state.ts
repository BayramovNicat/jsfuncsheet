import { getFormulaReferencedVariables } from "./highlight";
import type { Board } from "./types";
import { LAYOUT_CONFIG } from "./types";

// Default seeded template boards data
const defaultBoards: Board[] = [
	{
		id: "pokemon",
		name: "Pokemon Finder",
		variables: [
			{
				id: "A",
				label: "API URL",
				formula: `"https://pokeapi.co/api/v2/pokemon?limit=151"`,
				value: "https://pokeapi.co/api/v2/pokemon?limit=151",
				hasError: false,
				x: 20,
				y: 20,
			},
			{
				id: "B",
				label: "Fetch Pokemon List",
				formula: `const res = await fetch(A);\nconst data = await res.json();\nreturn data.results;`,
				value: [],
				hasError: false,
				x: 280,
				y: 20,
			},
			{
				id: "C",
				label: "Query Filter",
				formula: `"char"`,
				value: "char",
				hasError: false,
				x: 20,
				y: 100,
			},
			{
				id: "D",
				label: "Min Name Length",
				formula: "6",
				value: 6,
				hasError: false,
				x: 20,
				y: 180,
			},
			{
				id: "E",
				label: "Filtered Results",
				formula: `const list = B || [];\nconst query = String(C || "").toLowerCase();\nreturn list.filter(p => {\n  return p.name.includes(query) && p.name.length >= D;\n});`,
				value: [],
				hasError: false,
				x: 280,
				y: 180,
			},
		],
	},
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

let boards: Board[] = [...defaultBoards];

let activeBoardId = "pokemon";
let showConnections = true;
let showBadges = true;

export function getBoards(): Board[] {
	return boards;
}

export function getShowConnections(): boolean {
	return showConnections;
}

export function setShowConnections(show: boolean) {
	showConnections = show;
	saveStateToLocalStorage();
}

export function getShowBadges(): boolean {
	return showBadges;
}

export function setShowBadges(show: boolean) {
	showBadges = show;
	saveStateToLocalStorage();
}

let saveTimeout: number | undefined;

function performSave() {
	try {
		localStorage.setItem("jsfuncsheet_boards", JSON.stringify(boards));
		localStorage.setItem("jsfuncsheet_active_board_id", activeBoardId);
		localStorage.setItem(
			"jsfuncsheet_show_connections",
			String(showConnections),
		);
		localStorage.setItem("jsfuncsheet_show_badges", String(showBadges));
	} catch (e) {
		console.error("Failed to save state to localStorage", e);
	}
}

export function saveStateToLocalStorage() {
	if (saveTimeout !== undefined) {
		clearTimeout(saveTimeout);
	}
	saveTimeout = setTimeout(() => {
		performSave();
		saveTimeout = undefined;
	}, 300) as unknown as number;
}

window.addEventListener("beforeunload", () => {
	if (saveTimeout !== undefined) {
		clearTimeout(saveTimeout);
		performSave();
	}
});

export function loadStateFromLocalStorage() {
	try {
		let storedBoards = localStorage.getItem("jsfuncsheet_boards");
		let storedActiveId = localStorage.getItem("jsfuncsheet_active_board_id");
		const storedShow = localStorage.getItem("jsfuncsheet_show_connections");
		const storedBadges = localStorage.getItem("jsfuncsheet_show_badges");

		// Fallback to old keys for backward compatibility
		if (!storedBoards) {
			storedBoards = localStorage.getItem("excell_boards");
		}
		if (!storedActiveId) {
			storedActiveId = localStorage.getItem("excell_active_board_id");
		}

		if (storedBoards) {
			const parsed = JSON.parse(storedBoards);
			for (const db of defaultBoards) {
				if (!parsed.some((x: Board) => x.id === db.id)) {
					parsed.push(db);
				}
			}
			boards = parsed;
		}
		if (storedActiveId) {
			activeBoardId = storedActiveId;
		}
		if (!boards.some((b) => b.id === activeBoardId)) {
			activeBoardId = boards[0]?.id || "pokemon";
		}
		if (storedShow !== null) {
			showConnections = storedShow === "true";
		}
		if (storedBadges !== null) {
			showBadges = storedBadges === "true";
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
	const refIds = getFormulaReferencedVariables(
		formulaStr,
		activeId,
		activeBoard.variables,
	);

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
