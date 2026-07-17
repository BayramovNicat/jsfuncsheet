import './style.css';

interface Variable {
  id: string;      // Unique Identifier (e.g., A, B, C)
  label: string;   // Friendly display label
  formula: string; // Underlying formula (e.g., "A * B" or "100")
  value: number;   // Calculated value
  hasError: boolean;
  x: number;       // absolute X position on canvas
  y: number;       // absolute Y position on canvas
}

interface Board {
  id: string;
  name: string;
  variables: Variable[];
}

// Initial default boards data
let boards: Board[] = [
  {
    id: 'pricing',
    name: 'Pricing Estimator',
    variables: [
      { id: 'A', label: 'Base Project Cost', formula: '500', value: 500, hasError: false, x: 20, y: 20 },
      { id: 'B', label: 'Hourly Rate', formula: '75', value: 75, hasError: false, x: 20, y: 100 },
      { id: 'C', label: 'Estimated Hours', formula: '40', value: 40, hasError: false, x: 20, y: 180 },
      { id: 'D', label: 'Discount Percentage', formula: '10', value: 10, hasError: false, x: 20, y: 260 },
      { id: 'E', label: 'Total Cost', formula: 'A + (B * C) * (1 - D / 100)', value: 3200, hasError: false, x: 280, y: 20 }
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

// Dragging tracking state
let activeDragId: string | null = null;
let startMouseX = 0;
let startMouseY = 0;
let startCardX = 0;
let startCardY = 0;

// DOM Selectors
const inputsContainer = document.getElementById('inputs-container') as HTMLDivElement;
const addInputBtn = document.getElementById('add-input-btn') as HTMLButtonElement;
const boardsList = document.getElementById('boards-list') as HTMLDivElement;
const addBoardBtn = document.getElementById('add-board-btn') as HTMLButtonElement;

// Create global tooltip element
const tooltipEl = document.createElement('div');
tooltipEl.id = 'app-tooltip';
document.body.appendChild(tooltipEl);
let activeTooltipTarget: HTMLElement | null = null;

// Helper to get active board reference
function getActiveBoard(): Board {
  const b = boards.find(x => x.id === activeBoardId);
  if (b) return b;
  return boards[0];
}

// Helper to determine if a formula is a simple number
function isStaticNumber(formula: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(formula.trim());
}

// Format displays: omit decimals if integer, show up to 2 decimal places otherwise
function formatDisplayValue(val: number): string {
  const formatted = val.toFixed(2);
  if (formatted.endsWith('.00')) {
    return val.toString();
  }
  if (formatted.endsWith('0')) {
    return val.toFixed(1);
  }
  return formatted;
}

// Helper to generate next sequential Variable ID for active board
function getNextVariableId(): string {
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

// Safe equation evaluator for active board
function evaluateAll() {
  const activeBoard = getActiveBoard();
  const values: Record<string, number> = {};
  const errorVars = new Set<string>();

  function resolve(id: string, path: Set<string>): number {
    if (path.has(id)) {
      errorVars.add(id);
      throw new Error('Circular dependency');
    }

    if (id in values) {
      return values[id];
    }

    const v = activeBoard.variables.find((x) => x.id === id);
    if (!v) return 0;

    const formulaStr = v.formula.trim();

    // Check if it's a simple number
    if (isStaticNumber(formulaStr)) {
      const parsed = parseFloat(formulaStr);
      values[id] = parsed;
      v.value = parsed;
      v.hasError = false;
      return parsed;
    }

    path.add(id);

    try {
      const mathKeys = Object.getOwnPropertyNames(Math);
      const mathValues = mathKeys.map((key) => (Math as any)[key]);

      // Scan referenced variables
      const referenced: string[] = [];
      activeBoard.variables.forEach((x) => {
        if (x.id !== id && new RegExp(`\\b${x.id}\\b`).test(formulaStr)) {
          referenced.push(x.id);
        }
      });

      // Resolve referenced variables
      const resolvedVars: Record<string, number> = {};
      referenced.forEach((refId) => {
        resolvedVars[refId] = resolve(refId, new Set(path));
      });

      const argNames = Object.keys(resolvedVars);
      const argValues = Object.values(resolvedVars);

      const fn = new Function(...mathKeys, ...argNames, `"use strict"; return (${formulaStr});`);
      const rawResult = fn(...mathValues, ...argValues);

      if (rawResult === null || rawResult === undefined || typeof rawResult !== 'number' || isNaN(rawResult) || !isFinite(rawResult)) {
        throw new Error('Invalid math outcome');
      }

      values[id] = rawResult;
      v.value = rawResult;
      v.hasError = false;
      return rawResult;
    } catch (_err) {
      errorVars.add(id);
      v.hasError = true;
      values[id] = 0;
      v.value = 0;
      return 0;
    }
  }

  // Resolve everyone
  activeBoard.variables.forEach((v) => {
    try {
      resolve(v.id, new Set());
    } catch (_e) {
      // Circular references caught
    }
  });

  // Mark all dependencies recursively failing if root fails
  activeBoard.variables.forEach((v) => {
    if (errorVars.has(v.id)) {
      v.hasError = true;
    }
  });
}

// Reactively update input values of unchecked/blurred variables
function updateInputsDisplay() {
  const activeBoard = getActiveBoard();
  activeBoard.variables.forEach((v) => {
    const inputEl = document.querySelector(`.var-value-input[data-id="${v.id}"]`) as HTMLInputElement;
    if (inputEl && document.activeElement !== inputEl) {
      inputEl.type = 'text';
      
      if (v.hasError) {
        inputEl.value = 'Error';
        inputEl.classList.add('calc-error');
      } else {
        inputEl.value = formatDisplayValue(v.value);
        inputEl.classList.remove('calc-error');
      }
    }
  });
}

// Auto size active input depending on text length
function autoSizeInput(inputEl: HTMLInputElement) {
  const length = inputEl.value.length;
  const calculatedWidth = Math.max(214, (length + 4) * 9.5);
  inputEl.style.width = `${calculatedWidth}px`;
}

// Find first vacant position (scanning vertically within visible bounds, then shifting horizontally, and finally going deeper)
function findVacantPosition(): { x: number; y: number } {
  const activeBoard = getActiveBoard();
  const cardWidth = 240;
  const cardHeight = 60;
  
  const containerWidth = inputsContainer.clientWidth || window.innerWidth || 800;
  // Subtract footer tab bar height (48px) from clientHeight measurements
  const containerHeight = (inputsContainer.clientHeight || window.innerHeight || 600) - 48;

  // Phase 1: Scan vertically down column 1, then column 2, etc. (strictly inside visible screen space)
  for (let x = 20; x < containerWidth - cardWidth + 20; x += 260) {
    for (let y = 20; y < containerHeight - cardHeight; y += 80) {
      const overlaps = activeBoard.variables.some((v) => {
        return !(x + cardWidth <= v.x || v.x + cardWidth <= x || 
                 y + cardHeight <= v.y || v.y + cardHeight <= y);
      });
      if (!overlaps) {
        return { x, y };
      }
    }
  }

  // Phase 2: If the entire visible grid is fully occupied, start placing cards below the fold row-by-row
  const startY = Math.max(20, Math.floor((containerHeight - cardHeight) / 80) * 80 + 20);
  for (let y = startY; y < 5000 - cardHeight; y += 80) {
    for (let x = 20; x < containerWidth - cardWidth + 20; x += 260) {
      const overlaps = activeBoard.variables.some((v) => {
        return !(x + cardWidth <= v.x || v.x + cardWidth <= x || 
                 y + cardHeight <= v.y || v.y + cardHeight <= y);
      });
      if (!overlaps) {
        return { x, y };
      }
    }
  }
  
  return { x: 20, y: 20 };
}

// Add a single variable entry
function addNewVariable() {
  const activeBoard = getActiveBoard();
  const nextId = getNextVariableId();
  const pos = findVacantPosition();

  activeBoard.variables.push({
    id: nextId,
    label: `Variable ${nextId}`,
    formula: '10',
    value: 10,
    hasError: false,
    x: pos.x,
    y: pos.y
  });

  renderVariables();
  evaluateAll();
  updateInputsDisplay();
}

// Delete variable card
function deleteVariable(id: string) {
  const activeBoard = getActiveBoard();
  if (activeTooltipTarget && activeTooltipTarget.closest(`.variable-card[data-id="${id}"]`)) {
    hideTooltip();
  }
  activeBoard.variables = activeBoard.variables.filter((v) => v.id !== id);
  renderVariables();
  evaluateAll();
  updateInputsDisplay();
}

// Insert Variable ID at active caret
function insertBadgeId(id: string) {
  const activeBoard = getActiveBoard();
  const active = document.activeElement as HTMLInputElement | null;
  if (active && active.classList.contains('var-value-input')) {
    const varId = active.getAttribute('data-id');
    const variable = activeBoard.variables.find((v) => v.id === varId);
    if (!variable) return;

    if (variable.id === id) return;

    const start = active.selectionStart ?? active.value.length;
    const end = active.selectionEnd ?? active.value.length;
    const oldVal = active.value;

    active.value = oldVal.substring(0, start) + id + oldVal.substring(end);
    variable.formula = active.value;
    
    const newPos = start + id.length;
    active.setSelectionRange(newPos, newPos);

    autoSizeInput(active);
    evaluateAll();
    updateInputsDisplay();
  }
}

// Output HTML rendering of variable rows
function renderVariables() {
  const activeBoard = getActiveBoard();
  inputsContainer.innerHTML = '';

  activeBoard.variables.forEach((variable) => {
    const card = document.createElement('div');
    card.className = 'variable-card';
    card.setAttribute('data-id', variable.id);
    card.style.left = `${variable.x}px`;
    card.style.top = `${variable.y}px`;

    const initialType = 'text';
    const displayVal = variable.hasError ? 'Error' : formatDisplayValue(variable.value);

    card.innerHTML = `
      <div class="variable-card-row">
        <div class="field-group">
          <div class="var-title-row">
            <div class="var-title-left">
              <span class="variable-badge" data-badge-id="${variable.id}" data-tooltip="Insert ${variable.id}">${variable.id}</span>
              <span class="var-label-span">${variable.label}</span>
            </div>
            <button class="btn-delete" data-tooltip="Delete Variable" aria-label="Delete">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
          <input type="${initialType}" class="var-value-input" data-id="${variable.id}" value="${displayVal}" step="any" spellcheck="false" autocomplete="off">
        </div>
      </div>
    `;

    const labelSpan = card.querySelector('.var-label-span') as HTMLSpanElement;
    const valInput = card.querySelector('.var-value-input') as HTMLInputElement;
    const deleteBtn = card.querySelector('.btn-delete') as HTMLButtonElement;
    const badgeBtn = card.querySelector('.variable-badge') as HTMLDivElement;

    // Mouse Press -> Start dragging
    card.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.classList.contains('btn-delete') || target.tagName === 'svg' || target.tagName === 'path') {
        return;
      }
      
      e.preventDefault();
      activeDragId = variable.id;
      startMouseX = e.clientX;
      startMouseY = e.clientY;
      startCardX = variable.x;
      startCardY = variable.y;
      
      card.style.zIndex = '50';
    });

    // Double click label to rename inline
    labelSpan.addEventListener('dblclick', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'var-label-input';
      input.value = variable.label;

      const saveLabel = () => {
        variable.label = input.value.trim() || `Variable ${variable.id}`;
        renderVariables();
        updateInputsDisplay();
      };

      input.addEventListener('blur', saveLabel);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          input.blur();
        }
      });

      labelSpan.replaceWith(input);
      input.focus();
      input.select();
    });



    badgeBtn.addEventListener('mousedown', (e) => {
      const active = document.activeElement;
      if (active && active.classList.contains('var-value-input')) {
        e.preventDefault();
        insertBadgeId(variable.id);
      }
    });

    valInput.addEventListener('focus', () => {
      valInput.type = 'text';
      valInput.value = variable.formula;
      valInput.classList.remove('calc-error');
      autoSizeInput(valInput);
    });

    valInput.addEventListener('blur', () => {
      valInput.style.width = '';
      evaluateAll();
      updateInputsDisplay();
    });

    valInput.addEventListener('input', () => {
      variable.formula = valInput.value;
      autoSizeInput(valInput);
      evaluateAll();
      updateInputsDisplay();
    });

    valInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const isNum = isStaticNumber(valInput.value);
        if (isNum) {
          e.preventDefault();
          let val = parseFloat(valInput.value);
          if (isNaN(val)) val = 0;
          
          let step = 1;
          if (e.shiftKey) {
            step = 10;
          } else if (e.altKey) {
            step = 0.1;
          }
          
          if (e.key === 'ArrowUp') {
            val += step;
          } else {
            val -= step;
          }
          
          valInput.value = parseFloat(val.toFixed(4)).toString();
          variable.formula = valInput.value;
          
          autoSizeInput(valInput);
          evaluateAll();
          updateInputsDisplay();
        }
      } else if (e.key === 'Enter' || e.key === 'Escape') {
        valInput.blur();
      }
    });

    deleteBtn.addEventListener('click', () => deleteVariable(variable.id));

    inputsContainer.appendChild(card);
  });
}

// Global Drag Mousemove/Mouseup listeners to assure fluid translation
window.addEventListener('mousemove', (e) => {
  if (!activeDragId) return;

  const activeBoard = getActiveBoard();
  const variable = activeBoard.variables.find((v) => v.id === activeDragId);
  const card = document.querySelector(`.variable-card[data-id="${activeDragId}"]`) as HTMLDivElement;
  if (!variable || !card) return;

  const dx = e.clientX - startMouseX;
  const dy = e.clientY - startMouseY;

  let newX = startCardX + dx;
  let newY = startCardY + dy;

  // Contain within canvas box bounds
  const containerRect = inputsContainer.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const maxX = containerRect.width - cardRect.width;
  const maxY = containerRect.height - cardRect.height;

  newX = Math.max(0, Math.min(newX, maxX));
  newY = Math.max(0, Math.min(newY, maxY));

  // Snap to 20px grid configuration
  const snappedX = Math.round(newX / 20) * 20;
  const snappedY = Math.round(newY / 20) * 20;

  variable.x = snappedX;
  variable.y = snappedY;

  card.style.left = `${snappedX}px`;
  card.style.top = `${snappedY}px`;
});

window.addEventListener('mouseup', () => {
  if (activeDragId) {
    const card = document.querySelector(`.variable-card[data-id="${activeDragId}"]`) as HTMLDivElement;
    if (card) {
      card.style.zIndex = '1';
    }
    activeDragId = null;
  }
});

// Tooltip positioning manager
function showTooltip(target: HTMLElement) {
  const text = target.getAttribute('data-tooltip');
  if (!text) return;

  tooltipEl.textContent = text;
  tooltipEl.style.display = 'block';
  activeTooltipTarget = target;

  repositionTooltip();
}

function hideTooltip() {
  tooltipEl.style.display = 'none';
  activeTooltipTarget = null;
}

function repositionTooltip() {
  if (!activeTooltipTarget) return;

  const rect = activeTooltipTarget.getBoundingClientRect();
  const tooltipWidth = tooltipEl.offsetWidth;
  const tooltipHeight = tooltipEl.offsetHeight;

  let left = rect.left + rect.width / 2 - tooltipWidth / 2;
  let top = rect.top - tooltipHeight - 6;

  left = Math.max(6, Math.min(left, window.innerWidth - tooltipWidth - 6));

  if (top < 6) {
    top = rect.bottom + 6;
  }

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

// Global delegated mouseover listener
document.addEventListener('mouseover', (e) => {
  const target = (e.target as HTMLElement).closest('[data-tooltip]') as HTMLElement;
  if (target) {
    showTooltip(target);
  }
});

document.addEventListener('mouseout', (e) => {
  const target = (e.target as HTMLElement).closest('[data-tooltip]') as HTMLElement;
  if (target && target === activeTooltipTarget) {
    hideTooltip();
  }
});

window.addEventListener('scroll', repositionTooltip, { passive: true });
inputsContainer.addEventListener('scroll', repositionTooltip, { passive: true });

// --- Multiboard Control Actions ---

// Generate the bottom tabs bar
function renderTabsList() {
  boardsList.innerHTML = '';

  boards.forEach((board) => {
    const tab = document.createElement('div');
    tab.className = `board-tab ${board.id === activeBoardId ? 'active' : ''}`;
    
    // Switch active board on click
    tab.addEventListener('click', (e) => {
      // Don't shift target if clicking inline editor input or close button
      const target = e.target as HTMLElement;
      if (target.closest('.btn-tab-close') || target.tagName === 'INPUT') {
        return;
      }
      if (activeBoardId === board.id) {
        return; // Avoid destroying DOM on click so dblclick can work
      }
      activeBoardId = board.id;
      renderTabsList();
      renderVariables();
      evaluateAll();
      updateInputsDisplay();
    });

    // Double click to rename tab inline
    tab.addEventListener('dblclick', () => {
      const span = tab.querySelector('.board-tab-name-span') as HTMLSpanElement;
      if (!span) return;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'board-tab-name-input';
      input.value = board.name;

      const saveName = () => {
        board.name = input.value.trim() || 'Untitled Board';
        renderTabsList();
      };

      input.addEventListener('blur', saveName);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
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

    const closeBtn = tab.querySelector('.btn-tab-close') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => {
      if (boards.length <= 1) {
        alert('You must keep at least one board!');
        return;
      }
      
      const confirmClose = confirm(`Are you sure you want to delete "${board.name}"?`);
      if (confirmClose) {
        boards = boards.filter(x => x.id !== board.id);
        if (activeBoardId === board.id) {
          activeBoardId = boards[0].id;
        }
        renderTabsList();
        renderVariables();
        evaluateAll();
        updateInputsDisplay();
      }
    });

    boardsList.appendChild(tab);
  });
}

// Add a fresh empty board template
function createNewBoard() {
  const newId = `board-${Date.now()}`;
  const newName = `Board ${boards.length + 1}`;
  
  boards.push({
    id: newId,
    name: newName,
    variables: [
      { id: 'A', label: 'Item 1', formula: '10', value: 10, hasError: false, x: 20, y: 20 }
    ]
  });

  activeBoardId = newId;
  renderTabsList();
  renderVariables();
  evaluateAll();
  updateInputsDisplay();
}

// Bindings
addInputBtn.addEventListener('click', () => addNewVariable());
addBoardBtn.addEventListener('click', () => createNewBoard());

// Initial run
evaluateAll();
renderVariables();
updateInputsDisplay();
renderTabsList();
