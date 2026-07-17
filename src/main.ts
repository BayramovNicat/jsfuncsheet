import './style.css';
import {
  isStaticNumber,
  formatDisplayValue,
  compileFormula,
  syntaxHighlight,
  evaluateAllVariables
} from './math';
import {
  getBoards,
  setBoards,
  getActiveBoardId,
  setActiveBoardId,
  getActiveBoard,
  generateNextId,
  updateCardHighlights,
  clearCardHighlights
} from './state';
import {
  findVacantPosition,
  calculateDraggedPosition
} from './canvas';
import {
  initializeTooltip,
  showTooltip,
  hideTooltip,
  repositionTooltip,
  getActiveTooltipTarget
} from './tooltip';

// DOM Selectors
const inputsContainer = document.getElementById('inputs-container') as HTMLDivElement;
const addInputBtn = document.getElementById('add-input-btn') as HTMLButtonElement;
const boardsList = document.getElementById('boards-list') as HTMLDivElement;
const addBoardBtn = document.getElementById('add-board-btn') as HTMLButtonElement;

// Local drag states coordinator
let activeDragId: string | null = null;
let startMouseX = 0;
let startMouseY = 0;
let startCardX = 0;
let startCardY = 0;

// Updates the display value and errors of blurred inputs
function updateInputsDisplay() {
  const activeBoard = getActiveBoard();
  activeBoard.variables.forEach((v) => {
    const inputEl = document.querySelector(`.var-value-input[data-id="${v.id}"]`) as HTMLTextAreaElement;
    if (inputEl && document.activeElement !== inputEl) {
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

// Auto size textareas
function autoSizeTextarea(inputEl: HTMLTextAreaElement) {
  inputEl.style.height = 'auto';
  const scrollHeight = inputEl.scrollHeight;
  const calculatedHeight = Math.max(24, Math.min(scrollHeight, 300));
  inputEl.style.height = `${calculatedHeight}px`;

  const lines = inputEl.value.split('\n');
  const maxLineLength = Math.max(...lines.map(line => line.length));
  const calculatedWidth = Math.max(214, (maxLineLength + 4) * 9.5);
  inputEl.style.width = `${calculatedWidth}px`;

  const cardEl = inputEl.closest('.variable-card');
  if (cardEl) {
    const overlayEl = cardEl.querySelector('.value-highlight-overlay') as HTMLDivElement;
    if (overlayEl) {
      overlayEl.style.width = `${calculatedWidth}px`;
      overlayEl.style.height = `${calculatedHeight}px`;
    }
  }
}

// Add a single variable entry
function addNewVariable() {
  const activeBoard = getActiveBoard();
  const nextId = generateNextId();
  const pos = findVacantPosition(
    activeBoard.variables,
    inputsContainer.clientWidth,
    inputsContainer.clientHeight
  );

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
  evaluateAllVariables(activeBoard.variables);
  updateInputsDisplay();
}

// Delete variable card
function deleteVariable(id: string) {
  const activeBoard = getActiveBoard();
  const activeTT = getActiveTooltipTarget();
  
  if (activeTT && activeTT.closest(`.variable-card[data-id="${id}"]`)) {
    hideTooltip();
  }
  activeBoard.variables = activeBoard.variables.filter((v) => v.id !== id);
  renderVariables();
  evaluateAllVariables(activeBoard.variables);
  updateInputsDisplay();
}

// Insert Variable ID at active textarea caret
function insertBadgeId(id: string) {
  const activeBoard = getActiveBoard();
  const active = document.activeElement as HTMLTextAreaElement | null;
  if (active && active.classList.contains('var-value-input')) {
    const varId = active.getAttribute('data-id');
    const variable = activeBoard.variables.find((v) => v.id === varId);
    if (!variable || variable.id === id) return;

    const start = active.selectionStart ?? active.value.length;
    const end = active.selectionEnd ?? active.value.length;
    const oldVal = active.value;

    active.value = oldVal.substring(0, start) + id + oldVal.substring(end);
    variable.formula = active.value;
    
    const newPos = start + id.length;
    active.setSelectionRange(newPos, newPos);

    autoSizeTextarea(active);
    
    // Sync syntax highlighter overlay
    const cardEl = active.closest('.variable-card');
    if (cardEl) {
      const overlayEl = cardEl.querySelector('.value-highlight-overlay') as HTMLDivElement;
      if (overlayEl) {
        overlayEl.innerHTML = syntaxHighlight(active.value, variable.id, activeBoard.variables);
        overlayEl.scrollLeft = active.scrollLeft;
        overlayEl.scrollTop = active.scrollTop;
      }
    }

    updateCardHighlights(variable.id, active.value);

    // Live JS compiler check
    const check = compileFormula(active.value, variable.id, activeBoard.variables);
    if (check.error) {
      active.setAttribute('data-tooltip', `⚠️ ${check.error}`);
      active.classList.add('calc-error');
      showTooltip(active);
    } else {
      active.removeAttribute('data-tooltip');
      active.classList.remove('calc-error');
      hideTooltip();
    }

    evaluateAllVariables(activeBoard.variables);
    updateInputsDisplay();
  }
}

// Render dynamic card entries
function renderVariables() {
  const activeBoard = getActiveBoard();
  inputsContainer.innerHTML = '';

  activeBoard.variables.forEach((variable) => {
    const card = document.createElement('div');
    card.className = 'variable-card';
    card.setAttribute('data-id', variable.id);
    card.style.left = `${variable.x}px`;
    card.style.top = `${variable.y}px`;

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
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
          <div class="var-value-wrapper">
            <div class="value-highlight-overlay" data-id="${variable.id}"></div>
            <textarea class="var-value-input" data-id="${variable.id}" spellcheck="false" autocomplete="off" rows="1">${displayVal}</textarea>
          </div>
        </div>
      </div>
    `;

    const labelSpan = card.querySelector('.var-label-span') as HTMLSpanElement;
    const valInput = card.querySelector('.var-value-input') as HTMLTextAreaElement;
    const overlayEl = card.querySelector('.value-highlight-overlay') as HTMLDivElement;
    const deleteBtn = card.querySelector('.btn-delete') as HTMLButtonElement;
    const badgeBtn = card.querySelector('.variable-badge') as HTMLDivElement;

    // Mouse Press -> Drag nodes
    card.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.classList.contains('btn-delete') || 
        target.tagName === 'svg' || 
        target.tagName === 'path'
      ) {
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

    // Double click to edit title labels
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

    // Synchronize textarea scroll position to overlay
    valInput.addEventListener('scroll', () => {
      overlayEl.scrollLeft = valInput.scrollLeft;
      overlayEl.scrollTop = valInput.scrollTop;
    });

    // Textarea inputs
    valInput.addEventListener('focus', () => {
      valInput.value = variable.formula;
      valInput.classList.remove('calc-error');
      
      autoSizeTextarea(valInput);

      overlayEl.style.display = 'block';
      overlayEl.innerHTML = syntaxHighlight(valInput.value, variable.id, activeBoard.variables);
      overlayEl.scrollLeft = valInput.scrollLeft;
      overlayEl.scrollTop = valInput.scrollTop;

      updateCardHighlights(variable.id, valInput.value);

      const check = compileFormula(valInput.value, variable.id, activeBoard.variables);
      if (check.error) {
        valInput.setAttribute('data-tooltip', `⚠️ ${check.error}`);
        valInput.classList.add('calc-error');
        showTooltip(valInput);
      } else {
        valInput.removeAttribute('data-tooltip');
        valInput.classList.remove('calc-error');
      }
    });

    valInput.addEventListener('blur', () => {
      valInput.style.width = '';
      valInput.style.height = '';
      valInput.removeAttribute('data-tooltip');
      overlayEl.style.width = '';
      overlayEl.style.height = '';
      overlayEl.style.display = 'none';
      clearCardHighlights();
      hideTooltip();
      
      evaluateAllVariables(activeBoard.variables);
      updateInputsDisplay();
    });

    valInput.addEventListener('input', () => {
      variable.formula = valInput.value;
      autoSizeTextarea(valInput);

      overlayEl.innerHTML = syntaxHighlight(valInput.value, variable.id, activeBoard.variables);
      overlayEl.scrollLeft = valInput.scrollLeft;
      overlayEl.scrollTop = valInput.scrollTop;

      updateCardHighlights(variable.id, valInput.value);

      const check = compileFormula(valInput.value, variable.id, activeBoard.variables);
      if (check.error) {
        valInput.setAttribute('data-tooltip', `⚠️ ${check.error}`);
        valInput.classList.add('calc-error');
        showTooltip(valInput);
      } else {
        valInput.removeAttribute('data-tooltip');
        valInput.classList.remove('calc-error');
        hideTooltip();
      }
      
      evaluateAllVariables(activeBoard.variables);
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
          
          autoSizeTextarea(valInput);
          overlayEl.innerHTML = syntaxHighlight(valInput.value, variable.id, activeBoard.variables);
          overlayEl.scrollLeft = valInput.scrollLeft;
          overlayEl.scrollTop = valInput.scrollTop;
          updateCardHighlights(variable.id, valInput.value);

          const check = compileFormula(valInput.value, variable.id, activeBoard.variables);
          if (check.error) {
            valInput.setAttribute('data-tooltip', `⚠️ ${check.error}`);
            valInput.classList.add('calc-error');
            showTooltip(valInput);
          } else {
            valInput.removeAttribute('data-tooltip');
            valInput.classList.remove('calc-error');
            hideTooltip();
          }

          evaluateAllVariables(activeBoard.variables);
          updateInputsDisplay();
        }
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        valInput.blur();
      } else if (e.key === 'Escape') {
        valInput.blur();
      }
    });

    deleteBtn.addEventListener('click', () => deleteVariable(variable.id));

    inputsContainer.appendChild(card);
  });
}

// Global Drag Mousemove coordinate updates
window.addEventListener('mousemove', (e) => {
  if (!activeDragId) return;

  const activeBoard = getActiveBoard();
  const variable = activeBoard.variables.find((v) => v.id === activeDragId);
  const card = document.querySelector(`.variable-card[data-id="${activeDragId}"]`) as HTMLDivElement;
  if (!variable || !card) return;

  const snappedPos = calculateDraggedPosition(
    e.clientX,
    e.clientY,
    startMouseX,
    startMouseY,
    startCardX,
    startCardY,
    inputsContainer.clientWidth,
    inputsContainer.clientHeight
  );

  variable.x = snappedPos.x;
  variable.y = snappedPos.y;

  card.style.left = `${snappedPos.x}px`;
  card.style.top = `${snappedPos.y}px`;
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

// Sync tooltips positions on scroll events
window.addEventListener('scroll', repositionTooltip, { passive: true });
inputsContainer.addEventListener('scroll', repositionTooltip, { passive: true });

// delegated global tooltips
document.addEventListener('mouseover', (e) => {
  const target = (e.target as HTMLElement).closest('[data-tooltip]') as HTMLElement;
  if (target) {
    showTooltip(target);
  }
});

document.addEventListener('mouseout', (e) => {
  const target = (e.target as HTMLElement).closest('[data-tooltip]') as HTMLElement;
  const activeTT = getActiveTooltipTarget();
  if (target && target === activeTT) {
    hideTooltip();
  }
});

// Render the bottom board toggler tabs
function renderTabsList() {
  boardsList.innerHTML = '';
  const boards = getBoards();
  const activeBoardId = getActiveBoardId();

  boards.forEach((board) => {
    const tab = document.createElement('div');
    tab.className = `board-tab ${board.id === activeBoardId ? 'active' : ''}`;
    
    tab.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.btn-tab-close') || target.tagName === 'INPUT') {
        return;
      }
      if (getActiveBoardId() === board.id) {
        return;
      }
      setActiveBoardId(board.id);
      renderTabsList();
      renderVariables();
      evaluateAllVariables(getActiveBoard().variables);
      updateInputsDisplay();
    });

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
      const allBoards = getBoards();
      if (allBoards.length <= 1) {
        alert('You must keep at least one board!');
        return;
      }
      
      const confirmClose = confirm(`Are you sure you want to delete "${board.name}"?`);
      if (confirmClose) {
        const remaining = allBoards.filter(x => x.id !== board.id);
        setBoards(remaining);
        if (getActiveBoardId() === board.id) {
          setActiveBoardId(remaining[0].id);
        }
        renderTabsList();
        renderVariables();
        evaluateAllVariables(getActiveBoard().variables);
        updateInputsDisplay();
      }
    });

    boardsList.appendChild(tab);
  });
}

function createNewBoard() {
  const allBoards = getBoards();
  const newId = `board-${Date.now()}`;
  const newName = `Board ${allBoards.length + 1}`;
  
  allBoards.push({
    id: newId,
    name: newName,
    variables: [
      { id: 'A', label: 'Item 1', formula: '10', value: 10, hasError: false, x: 20, y: 20 }
    ]
  });

  setActiveBoardId(newId);
  renderTabsList();
  renderVariables();
  evaluateAllVariables(getActiveBoard().variables);
  updateInputsDisplay();
}

// Bindings config
addInputBtn.addEventListener('click', () => addNewVariable());
addBoardBtn.addEventListener('click', () => createNewBoard());

// Initialize tooltip & first render
initializeTooltip();
evaluateAllVariables(getActiveBoard().variables);
renderVariables();
updateInputsDisplay();
renderTabsList();
