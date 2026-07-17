// Dynamic Custom Javacript-driven Tooltip Manager

let tooltipEl: HTMLDivElement | null = null;
let activeTooltipTarget: HTMLElement | null = null;

export function initializeTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'app-tooltip';
    document.body.appendChild(tooltipEl);
  }
}

export function getActiveTooltipTarget(): HTMLElement | null {
  return activeTooltipTarget;
}

export function showTooltip(target: HTMLElement) {
  if (!tooltipEl) return;
  const text = target.getAttribute('data-tooltip');
  if (!text) return;

  tooltipEl.textContent = text;
  tooltipEl.style.display = 'block';
  activeTooltipTarget = target;

  repositionTooltip();
}

export function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.style.display = 'none';
  }
  activeTooltipTarget = null;
}

export function repositionTooltip() {
  if (!tooltipEl || !activeTooltipTarget) return;

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
