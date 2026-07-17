import type { Board } from './types';

// Default seeded template boards data
let boards: Board[] = [
  {
    id: 'pricing',
    name: 'Pricing Estimator',
    variables: [
      { id: 'A', label: 'Base Project Cost', formula: '500', value: 500, hasError: false, x: 20, y: 20 },
      { id: 'B', label: 'Hourly Rate', formula: '75', value: 75, hasError: false, x: 20, y: 100 },
      { id: 'C', label: 'Estimated Hours', formula: '40', value: 40, hasError: false, x: 20, y: 180 },
      { id: 'D', label: 'Discount Percentage', formula: '10', value: 10, hasError: false, x: 20, y: 260 },
      { id: 'E', label: 'Total Cost', formula: 'const subtotal = B * C;\nconst saving = subtotal * (D / 100);\nreturn A + subtotal - saving;', value: 3200, hasError: false, x: 280, y: 20 }
    ]
  },
  {
    id: 'split',
    name: 'Dinner Splitter',
    variables: [
      { id: 'A', label: 'Total Dinner Bill', formula: '120', value: 120, hasError: false, x: 20, y: 20 },
      { id: 'B', label: 'Number of Friends', formula: '4', value: 4, hasError: false, x: 20, y: 100 },
      { id: 'C', label: 'Tip Percentage', formula: '15', value: 15, hasError: false, x: 20, y: 180 },
      { id: 'D', label: 'Cost Per Friend', formula: '(A * (1 + C / 100)) / B', value: 34.5, hasError: false, x: 280, y: 20 }
    ]
  }
];

let activeBoardId = 'pricing';

export function getBoards(): Board[] {
  return boards;
}

export function setBoards(newBoards: Board[]) {
  boards = newBoards;
}

export function getActiveBoardId(): string {
  return activeBoardId;
}

export function setActiveBoardId(id: string) {
  activeBoardId = id;
}

export function getActiveBoard(): Board {
  const b = boards.find(x => x.id === activeBoardId);
  if (b) return b;
  return boards[0];
}

// Generate next available single/double letter Variable ID
export function generateNextId(): string {
  const activeBoard = getActiveBoard();
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
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
    .filter(x => x.id !== activeId)
    .sort((a, b) => b.id.length - a.id.length);

  const refIds = sortedVars
    .filter((x) => new RegExp(`\\b${x.id}\\b`).test(formulaStr))
    .map(x => x.id);

  refIds.forEach((id, index) => {
    const colorIndex = (index % 5) + 1;
    const cardEl = document.querySelector(`.variable-card[data-id="${id}"]`);
    if (cardEl) {
      cardEl.classList.add(`card-hl-${colorIndex}`);
    }
  });
}

export function clearCardHighlights() {
  document.querySelectorAll('.variable-card').forEach((card) => {
    card.classList.remove('card-hl-1', 'card-hl-2', 'card-hl-3', 'card-hl-4', 'card-hl-5');
  });
}
