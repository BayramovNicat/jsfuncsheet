import {
	getActiveBoardId,
	getBoards,
	saveStateToLocalStorage,
	setActiveBoardId,
	setBoards,
} from "./state";
import { getActiveTooltipTarget, showTooltip } from "./tooltip";
import type { Board, Variable } from "./types";

export interface SharedBoardData {
	v?: number;
	name: string;
	variables: Array<{
		id: string;
		label: string;
		formula: string;
		x: number;
		y: number;
		colorIndex?: number;
		type?: "formula" | "select";
		selectOptionsVar?: string;
		lastFormula?: string;
		lastSelectOptionsVar?: string;
	}>;
}

// Compact tuple schema (v2 backward compatibility):
// [version (2), name, [ [id, label, formula, x, y, colorIndex?, type?, selectVar?] ]]
type CompactVariableTuple = [
	string, // 0: id
	string, // 1: label ("" if matches `Variable ${id}`)
	string, // 2: formula
	number, // 3: x
	number, // 4: y
	number?, // 5: colorIndex (0 if undefined)
	number?, // 6: type (1 for select, 0 for formula)
	string?, // 7: selectOptionsVar
];

type CompactBoardTuple = [
	2, // version 2
	string, // name
	CompactVariableTuple[],
];

let toastTimeout: number | undefined;

export function showToast(message: string, duration = 2500): void {
	let toast = document.getElementById("app-toast");
	if (!toast) {
		toast = document.createElement("div");
		toast.id = "app-toast";
		toast.className = "toast-notification";
		document.body.appendChild(toast);
	}
	toast.textContent = message;
	toast.classList.add("show");

	if (toastTimeout !== undefined) {
		clearTimeout(toastTimeout);
	}
	toastTimeout = setTimeout(() => {
		toast?.classList.remove("show");
		toastTimeout = undefined;
	}, duration) as unknown as number;
}

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = "";
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function base64UrlToBytes(str: string): Uint8Array {
	let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
	while (base64.length % 4) {
		base64 += "=";
	}
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

// Custom binary packing (v3) - Maximum density
function packBoard(board: Board): Uint8Array {
	const enc = new TextEncoder();
	const nameBuf = enc.encode(board.name);
	const chunks: Uint8Array[] = [
		new Uint8Array([3]), // version 3
		new Uint8Array([nameBuf.length]),
		nameBuf,
		new Uint8Array([board.variables.length]),
	];

	for (const v of board.variables) {
		const isCustomLabel =
			v.label !== `Variable ${v.id}` && v.label.trim().length > 0;
		const isSelect = v.type === "select";
		const hasColor = typeof v.colorIndex === "number" && v.colorIndex > 0;
		const flags =
			(isSelect ? 1 : 0) | (isCustomLabel ? 2 : 0) | (hasColor ? 4 : 0);

		const idBuf = enc.encode(v.id);
		chunks.push(new Uint8Array([flags, idBuf.length]));
		chunks.push(idBuf);

		if (hasColor) {
			chunks.push(new Uint8Array([v.colorIndex as number]));
		}

		chunks.push(
			new Uint8Array([
				Math.max(0, Math.min(255, Math.round(v.x / 20))),
				Math.max(0, Math.min(255, Math.round(v.y / 20))),
			]),
		);

		if (isCustomLabel) {
			const lblBuf = enc.encode(v.label);
			chunks.push(new Uint8Array([lblBuf.length]));
			chunks.push(lblBuf);
		}

		if (isSelect) {
			const selBuf = enc.encode(v.selectOptionsVar || "");
			chunks.push(new Uint8Array([selBuf.length]));
			chunks.push(selBuf);
		}

		const fBuf = enc.encode(v.formula);
		const lenBuf = new Uint8Array(2);
		lenBuf[0] = fBuf.length & 0xff;
		lenBuf[1] = (fBuf.length >> 8) & 0xff;
		chunks.push(lenBuf);
		chunks.push(fBuf);
	}

	const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
	const out = new Uint8Array(totalLen);
	let offset = 0;
	for (const c of chunks) {
		out.set(c, offset);
		offset += c.length;
	}
	return out;
}

function unpackBoard(bytes: Uint8Array): SharedBoardData | null {
	if (bytes.length < 3) return null;
	const dec = new TextDecoder();
	let offset = 0;
	const version = bytes[offset++];
	if (version !== 3) return null;

	const nameLen = bytes[offset++];
	if (offset + nameLen > bytes.length) return null;
	const name = dec.decode(bytes.subarray(offset, offset + nameLen));
	offset += nameLen;

	const varCount = bytes[offset++];
	const variables: SharedBoardData["variables"] = [];

	for (let i = 0; i < varCount; i++) {
		if (offset >= bytes.length) return null;
		const flags = bytes[offset++];
		const isSelect = (flags & 1) !== 0;
		const isCustomLabel = (flags & 2) !== 0;
		const hasColor = (flags & 4) !== 0;

		const idLen = bytes[offset++];
		const id = dec.decode(bytes.subarray(offset, offset + idLen));
		offset += idLen;

		let colorIndex: number | undefined;
		if (hasColor) {
			colorIndex = bytes[offset++];
		}

		const gridX = bytes[offset++];
		const gridY = bytes[offset++];

		let label = `Variable ${id}`;
		if (isCustomLabel) {
			const lblLen = bytes[offset++];
			label = dec.decode(bytes.subarray(offset, offset + lblLen));
			offset += lblLen;
		}

		let selectOptionsVar: string | undefined;
		if (isSelect) {
			const selLen = bytes[offset++];
			selectOptionsVar =
				dec.decode(bytes.subarray(offset, offset + selLen)) || undefined;
			offset += selLen;
		}

		const fLen = bytes[offset] | (bytes[offset + 1] << 8);
		offset += 2;
		const formula = dec.decode(bytes.subarray(offset, offset + fLen));
		offset += fLen;

		variables.push({
			id,
			label,
			formula,
			x: gridX * 20,
			y: gridY * 20,
			...(colorIndex !== undefined ? { colorIndex } : {}),
			...(isSelect ? { type: "select" as const } : {}),
			...(selectOptionsVar ? { selectOptionsVar } : {}),
		});
	}

	return { v: 3, name, variables };
}

function compactToBoard(compact: CompactBoardTuple): SharedBoardData {
	const [, name, vars] = compact;
	return {
		v: 2,
		name,
		variables: vars.map((item) => {
			const [id, label, formula, x, y, colorIndex, typeNum, selectVar] = item;
			return {
				id,
				label: label || `Variable ${id}`,
				formula,
				x,
				y,
				...(colorIndex ? { colorIndex } : {}),
				...(typeNum === 1 ? { type: "select" as const } : {}),
				...(selectVar ? { selectOptionsVar: selectVar } : {}),
			};
		}),
	};
}

export async function compressBoard(board: Board): Promise<string> {
	const packed = packBoard(board);

	// Try deflate-raw first for smallest possible payload (no headers/trailers)
	if (typeof CompressionStream !== "undefined") {
		try {
			const stream = new Blob([packed as unknown as BlobPart])
				.stream()
				.pipeThrough(new CompressionStream("deflate-raw"));
			const buffer = await new Response(stream).arrayBuffer();
			return bytesToBase64Url(new Uint8Array(buffer));
		} catch {
			// Fallback to gzip if deflate-raw not supported
			try {
				const stream = new Blob([packed as unknown as BlobPart])
					.stream()
					.pipeThrough(new CompressionStream("gzip"));
				const buffer = await new Response(stream).arrayBuffer();
				return bytesToBase64Url(new Uint8Array(buffer));
			} catch (err) {
				console.warn("CompressionStream failed, using base64 fallback", err);
			}
		}
	}

	return bytesToBase64Url(packed);
}

export async function decompressBoard(
	encoded: string,
): Promise<SharedBoardData | null> {
	if (!encoded || typeof encoded !== "string") return null;

	const clean = encoded.trim();
	let decompressedBytes: Uint8Array | null = null;

	// 1. Try DecompressionStream ("deflate-raw" then "gzip")
	if (typeof DecompressionStream !== "undefined") {
		try {
			const bytes = base64UrlToBytes(clean);
			const stream = new Blob([bytes as unknown as BlobPart])
				.stream()
				.pipeThrough(new DecompressionStream("deflate-raw"));
			const buffer = await new Response(stream).arrayBuffer();
			decompressedBytes = new Uint8Array(buffer);
		} catch {
			// Try gzip
			try {
				const bytes = base64UrlToBytes(clean);
				const stream = new Blob([bytes as unknown as BlobPart])
					.stream()
					.pipeThrough(new DecompressionStream("gzip"));
				const buffer = await new Response(stream).arrayBuffer();
				decompressedBytes = new Uint8Array(buffer);
			} catch {
				// Continue to fallbacks
			}
		}
	}

	// 2. Fallback to raw base64url bytes
	if (!decompressedBytes) {
		try {
			decompressedBytes = base64UrlToBytes(clean);
		} catch {
			// Continue
		}
	}

	// First try binary unpack (v3)
	if (decompressedBytes && decompressedBytes[0] === 3) {
		const unpacked = unpackBoard(decompressedBytes);
		if (unpacked) return unpacked;
	}

	// Otherwise, decode as UTF-8 string for JSON (v2 or v1)
	let text: string | null = null;
	if (decompressedBytes) {
		try {
			text = new TextDecoder().decode(decompressedBytes);
		} catch {
			// Continue
		}
	}

	if (!text) {
		try {
			text = decodeURIComponent(clean);
		} catch {
			return null;
		}
	}

	try {
		const parsed = JSON.parse(text);
		if (Array.isArray(parsed) && parsed[0] === 2) {
			return compactToBoard(parsed as CompactBoardTuple);
		}
		if (
			parsed &&
			typeof parsed.name === "string" &&
			Array.isArray(parsed.variables)
		) {
			return parsed as SharedBoardData;
		}
	} catch {
		// Parsing failed
	}

	return null;
}

export async function generateShareUrl(board: Board): Promise<string> {
	const encoded = await compressBoard(board);
	const url = new URL(window.location.href);
	url.search = "";
	url.hash = `t=${encoded}`;
	return url.toString();
}

export function getSharedDataFromUrl(): string | null {
	const hash = window.location.hash.startsWith("#")
		? window.location.hash.slice(1)
		: window.location.hash;

	if (hash) {
		const hashParams = new URLSearchParams(hash);
		const tabData =
			hashParams.get("t") || hashParams.get("tab") || hashParams.get("board");
		if (tabData) return tabData;
		if (!hash.includes("=") && hash.length > 5) {
			return hash;
		}
	}

	const searchParams = new URLSearchParams(window.location.search);
	const searchData =
		searchParams.get("t") ||
		searchParams.get("tab") ||
		searchParams.get("board");
	if (searchData) return searchData;

	return null;
}

export async function copyToClipboard(text: string): Promise<boolean> {
	if (navigator.clipboard && window.isSecureContext) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch (e) {
			console.warn("navigator.clipboard.writeText failed:", e);
		}
	}

	try {
		const textArea = document.createElement("textarea");
		textArea.value = text;
		textArea.style.position = "fixed";
		textArea.style.left = "-999999px";
		textArea.style.top = "-999999px";
		document.body.appendChild(textArea);
		textArea.focus();
		textArea.select();
		const successful = document.execCommand("copy");
		textArea.remove();
		if (successful) return true;
	} catch (e) {
		console.warn("Fallback execCommand copy failed:", e);
	}

	if (typeof window.prompt === "function") {
		window.prompt("Copy sharable link:", text);
	}
	return true;
}

export function areVariablesEquivalent(
	a: Variable[],
	b: SharedBoardData["variables"],
): boolean {
	if (a.length !== b.length) return false;
	const bMap = new Map(b.map((v) => [v.id, v]));

	for (const vA of a) {
		const vB = bMap.get(vA.id);
		if (!vB) return false;
		if (
			vA.label !== vB.label ||
			vA.formula !== vB.formula ||
			(vA.type || "formula") !== (vB.type || "formula") ||
			(vA.selectOptionsVar || "") !== (vB.selectOptionsVar || "") ||
			Math.round(vA.x) !== Math.round(vB.x) ||
			Math.round(vA.y) !== Math.round(vB.y)
		) {
			return false;
		}
	}
	return true;
}

export async function importSharedTabFromUrl(): Promise<Board | null> {
	const rawData = getSharedDataFromUrl();
	if (!rawData) return null;

	const sharedData = await decompressBoard(rawData);

	// Clean the address bar immediately so refresh never re-spawns shared elements
	if (
		window.location.hash.startsWith("#t=") ||
		window.location.hash.startsWith("#tab=") ||
		window.location.hash.startsWith("#board=") ||
		window.location.search.includes("t=") ||
		window.location.search.includes("tab=") ||
		window.location.search.includes("board=") ||
		(!window.location.hash.includes("=") && window.location.hash.length > 5)
	) {
		window.history.replaceState(null, "", window.location.pathname);
	}

	if (!sharedData || !Array.isArray(sharedData.variables)) return null;

	const allBoards = getBoards();

	// Check if already present and identical
	const existing = allBoards.find(
		(b) =>
			b.name === sharedData.name &&
			areVariablesEquivalent(b.variables, sharedData.variables),
	);

	if (existing) {
		if (getActiveBoardId() !== existing.id) {
			setActiveBoardId(existing.id);
		}
		return existing;
	}

	// Determine unique board name if collision
	let boardName = sharedData.name || "Shared Board";
	if (allBoards.some((b) => b.name === boardName)) {
		boardName = `${boardName} (Shared)`;
	}

	const newBoard: Board = {
		id: `shared-${Date.now()}`,
		name: boardName,
		variables: sharedData.variables.map((v) => ({
			id: v.id,
			label: v.label || `Variable ${v.id}`,
			formula: v.formula || "",
			value: null,
			hasError: false,
			x: v.x ?? 20,
			y: v.y ?? 20,
			colorIndex: v.colorIndex,
			type: v.type,
			selectOptionsVar: v.selectOptionsVar,
			lastFormula: v.lastFormula,
			lastSelectOptionsVar: v.lastSelectOptionsVar,
		})),
	};

	allBoards.push(newBoard);
	setBoards(allBoards);
	setActiveBoardId(newBoard.id);
	saveStateToLocalStorage();
	showToast(`Opened shared tab: "${newBoard.name}"`);

	return newBoard;
}

export async function handleShareTab(
	board: Board,
	triggerBtn?: HTMLElement,
): Promise<string> {
	if (
		typeof HTMLElement !== "undefined" &&
		document.activeElement instanceof HTMLElement
	) {
		document.activeElement.blur();
	}

	const url = await generateShareUrl(board);
	await copyToClipboard(url);

	// Note: We intentionally do NOT call history.replaceState with the share URL here.
	// This keeps the address bar clean so page refresh loads normally from localStorage
	// without re-spawning any shared tabs or elements.
	showToast(`Sharable link for "${board.name}" copied to clipboard!`);

	if (triggerBtn) {
		const originalHtml = triggerBtn.innerHTML;
		const originalTooltip = triggerBtn.getAttribute("data-tooltip") || "";

		const checkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${triggerBtn.classList.contains("btn-tab-share") ? "11" : "14"}" height="${triggerBtn.classList.contains("btn-tab-share") ? "11" : "14"}" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

		triggerBtn.innerHTML = checkSvg;
		triggerBtn.setAttribute("data-tooltip", "Link copied!");

		if (getActiveTooltipTarget() === triggerBtn) {
			showTooltip(triggerBtn);
		}

		setTimeout(() => {
			triggerBtn.innerHTML = originalHtml;
			if (originalTooltip) {
				triggerBtn.setAttribute("data-tooltip", originalTooltip);
			} else {
				triggerBtn.removeAttribute("data-tooltip");
			}
			if (getActiveTooltipTarget() === triggerBtn) {
				showTooltip(triggerBtn);
			}
		}, 2000);
	}

	return url;
}
