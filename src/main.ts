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

// Initial state - Staggered grid nodes on canvas
let activeVariables: Variable[] = [
  { id: 'A', label: 'Base Project Cost', formula: '500', value: 500, hasError: false, x: 20, y: 20 },
  { id: 'B', label: 'Hourly Rate', formula: '75', value: 75, hasError: false, x: 20, y: 120 },
  { id: 'C', label: 'Estimated Hours', formula: '40', value: 40, hasError: false, x: 20, y: 220 },
  { id: 'D', label: 'Discount Percentage', formula: '10', value: 10, hasError: false, x: 20, y: 320 },
  { id: 'E', label: 'Total Cost', formula: 'A + (B * C) * (1 - D / 100)', value: 3200, hasError: false, x: 280, y: 20 }
];

// Dragging tracking state
let activeDragId: string | null = null;
let startMouseX = 0;
let startMouseY = 0;
let startCardX = 0;
let startCardY = 0;

// DOM Selectors
const inputsContainer = document.getElementById('inputs-container') as HTMLDivElement;
const addInputBtn = document.getElementById('add-input-btn') as HTMLButtonElement;

// Helper to determine if a formula is a simple number
function isStaticNumber(formula: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(formula.trim());
}

// Helper to generate next sequential Variable ID
function getNextVariableId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const existingIds = activeVariables.map((v) => v.id);

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

// Safe equation evaluator
function evaluateAll() {
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

    const v = activeVariables.find((x) => x.id === id);
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
      activeVariables.forEach((x) => {
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
  activeVariables.forEach((v) => {
    try {
      resolve(v.id, new Set());
    } catch (_e) {
      // Circular references caught
    }
  });

  // Mark all dependencies recursively failing if root fails
  activeVariables.forEach((v) => {
    if (errorVars.has(v.id)) {
      v.hasError = true;
    }
  });
}

// Reactively update input values of unchecked/blurred variables
function updateInputsDisplay() {
  activeVariables.forEach((v) => {
    const inputEl = document.querySelector(`.var-value-input[data-id="${v.id}"]`) as HTMLInputElement;
    if (inputEl && document.activeElement !== inputEl) {
      const isNum = isStaticNumber(v.formula);
      inputEl.type = isNum ? 'number' : 'text';
      
      if (v.hasError) {
        inputEl.type = 'text';
        inputEl.value = 'Error';
        inputEl.classList.add('calc-error');
      } else {
        inputEl.value = v.value.toFixed(2);
        inputEl.classList.remove('calc-error');
      }
    }
  });
}

// Auto size active input depending on text length
function autoSizeInput(inputEl: HTMLInputElement) {
  const length = inputEl.value.length;
  const isCurrentlyNum = isStaticNumber(inputEl.value);
  const extraChars = isCurrentlyNum ? 5 : 4; // Extra spacing for spinners & padding
  const calculatedWidth = Math.max(214, (length + extraChars) * 9.5);
  inputEl.style.width = `${calculatedWidth}px`;
}

// Find first vacant position (scanning vertically within visible bounds, then shifting horizontally, and finally going deeper)
function findVacantPosition(): { x: number; y: number } {
  const cardWidth = 240;
  const cardHeight = 80;
  
  const containerWidth = inputsContainer.clientWidth || window.innerWidth || 800;
  const containerHeight = inputsContainer.clientHeight || window.innerHeight || 600;

  // Phase 1: Scan vertically down column 1, then column 2, etc. (strictly inside visible screen space)
  for (let x = 20; x < containerWidth - cardWidth + 20; x += 260) {
    for (let y = 20; y < containerHeight - cardHeight; y += 100) {
      const overlaps = activeVariables.some((v) => {
        return !(x + cardWidth <= v.x || v.x + cardWidth <= x || 
                 y + cardHeight <= v.y || v.y + cardHeight <= y);
      });
      if (!overlaps) {
        return { x, y };
      }
    }
  }

  // Phase 2: If the entire visible grid is fully occupied, start placing cards below the fold row-by-row
  const startY = Math.max(20, Math.floor((containerHeight - cardHeight) / 100) * 100 + 20);
  for (let y = startY; y < 5000 - cardHeight; y += 100) {
    for (let x = 20; x < containerWidth - cardWidth + 20; x += 260) {
      const overlaps = activeVariables.some((v) => {
        return !(x + cardWidth <= v.x || v.x + cardWidth <= x || 
                 y + cardHeight <= v.y || v.y + cardHeight <= y);
      });
      if (!overlaps) {
        return { x, y };
      }
    }
  }
  
  // Absolute fallback
  return { x: 20, y: 20 };
}

// Add a single variable entry
function addNewVariable() {
  const nextId = getNextVariableId();
  const pos = findVacantPosition();

  activeVariables.push({
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
  activeVariables = activeVariables.filter((v) => v.id !== id);
  renderVariables();
  evaluateAll();
  updateInputsDisplay();
}

// Insert Variable ID at active caret
function insertBadgeId(id: string) {
  const active = document.activeElement as HTMLInputElement | null;
  if (active && active.classList.contains('var-value-input')) {
    const varId = active.getAttribute('data-id');
    const variable = activeVariables.find((v) => v.id === varId);
    if (!variable) return;

    // Reject self-reference shortcut insertion
    if (variable.id === id) return;

    const start = active.selectionStart ?? active.value.length;
    const end = active.selectionEnd ?? active.value.length;
    const oldVal = active.value;

    active.value = oldVal.substring(0, start) + id + oldVal.substring(end);
    variable.formula = active.value;
    
    // Position cursor right after inserted text
    const newPos = start + id.length;
    active.setSelectionRange(newPos, newPos);

    autoSizeInput(active);
    evaluateAll();
    updateInputsDisplay();
  }
}

// Output HTML rendering of variable rows
function renderVariables() {
  inputsContainer.innerHTML = '';

  activeVariables.forEach((variable) => {
    const card = document.createElement('div');
    card.className = 'variable-card';
    card.setAttribute('data-id', variable.id);
    card.style.left = `${variable.x}px`;
    card.style.top = `${variable.y}px`;

    const isNum = isStaticNumber(variable.formula);
    const initialType = isNum && !variable.hasError ? 'number' : 'text';
    const displayVal = variable.hasError ? 'Error' : variable.value.toFixed(2);

    card.innerHTML = `
      <div class="variable-card-row">
        <div class="field-group">
          <div class="var-title-row">
            <div class="var-title-left">
              <span class="variable-badge" data-badge-id="${variable.id}" title="Click to insert into focused formula">${variable.id}</span>
              <input type="text" class="var-label-input" value="${variable.label}" title="Click to edit label name" placeholder="Label text">
            </div>
            <button class="btn-delete" title="Remove Variable" aria-label="Delete">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
          <input type="${initialType}" class="var-value-input" data-id="${variable.id}" value="${displayVal}" step="any" spellcheck="false" autocomplete="off">
        </div>
      </div>
    `;

    const labelInput = card.querySelector('.var-label-input') as HTMLInputElement;
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

    // React to labels
    labelInput.addEventListener('input', () => {
      variable.label = labelInput.value;
    });

    // React to badge clicks on mousedown to prevent input focus loss (blur)
    badgeBtn.addEventListener('mousedown', (e) => {
      const active = document.activeElement;
      if (active && active.classList.contains('var-value-input')) {
        e.preventDefault();
        insertBadgeId(variable.id);
      }
    });

    // Value input events
    valInput.addEventListener('focus', () => {
      const isCurrentlyNum = isStaticNumber(variable.formula);
      valInput.type = isCurrentlyNum ? 'number' : 'text';
      valInput.value = variable.formula;
      valInput.classList.remove('calc-error');
      
      // Auto check sizing
      autoSizeInput(valInput);
    });

    valInput.addEventListener('blur', () => {
      // Revert size back to standard wrapper width
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
      if (e.key === 'Enter' || e.key === 'Escape') {
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

  const variable = activeVariables.find((v) => v.id === activeDragId);
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

// Event Bindings
addInputBtn.addEventListener('click', () => addNewVariable());

// Initial run
evaluateAll();
renderVariables();
updateInputsDisplay();
