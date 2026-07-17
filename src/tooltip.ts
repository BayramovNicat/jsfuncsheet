// Dynamic Custom Javascript-driven Tooltip Manager

let tooltipEl: HTMLDivElement | null = null;
let activeTooltipTarget: HTMLElement | null = null;

export function initializeTooltip(): void {
  if (tooltipEl) return;
  tooltipEl = document.createElement('div');
  tooltipEl.id = 'app-tooltip';
  document.body.appendChild(tooltipEl);
}

export function getActiveTooltipTarget(): HTMLElement | null {
  return activeTooltipTarget;
}

export function showTooltip(target: HTMLElement): void {
  if (!tooltipEl) return;
  const text = target.getAttribute('data-tooltip');
  if (!text) return;

  tooltipEl.textContent = text;
  tooltipEl.style.display = 'block';
  activeTooltipTarget = target;

  repositionTooltip();
}

export function hideTooltip(): void {
  if (tooltipEl) {
    tooltipEl.style.display = 'none';
  }
  activeTooltipTarget = null;
}

export function repositionTooltip(): void {
  if (!tooltipEl || !activeTooltipTarget) return;

  const rect = activeTooltipTarget.getBoundingClientRect();
  const tooltipWidth = tooltipEl.offsetWidth;
  const tooltipHeight = tooltipEl.offsetHeight;

  const BOUNDARY_OFFSET = 6;
  let left = rect.left + rect.width / 2 - tooltipWidth / 2;
  let top = rect.top - tooltipHeight - BOUNDARY_OFFSET;

  left = Math.max(BOUNDARY_OFFSET, Math.min(left, window.innerWidth - tooltipWidth - BOUNDARY_OFFSET));

  if (top < BOUNDARY_OFFSET) {
    top = rect.bottom + BOUNDARY_OFFSET;
  }

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}
