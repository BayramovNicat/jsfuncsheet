import type { Variable } from './types';

// Find first vacant position (scanning vertically within visible bounds, then shifting horizontally, and finally going deeper)
export function findVacantPosition(
  variables: Variable[],
  containerWidth: number,
  containerHeight: number
): { x: number; y: number } {
  const cardWidth = 240;
  const cardHeight = 60;

  // Subtract footer tab bar height (48px) from clientHeight measurements
  const activeHeight = containerHeight - 48;

  // Phase 1: Scan vertically down column 1, then column 2, etc. (strictly inside visible screen space)
  for (let x = 20; x < containerWidth - cardWidth + 20; x += 260) {
    for (let y = 20; y < activeHeight - cardHeight; y += 80) {
      const overlaps = variables.some((v) => {
        return !(x + cardWidth <= v.x || v.x + cardWidth <= x || 
                 y + cardHeight <= v.y || v.y + cardHeight <= y);
      });
      if (!overlaps) {
        return { x, y };
      }
    }
  }

  // Phase 2: If the entire visible grid is fully occupied, start placing cards below the fold row-by-row
  const startY = Math.max(20, Math.floor((activeHeight - cardHeight) / 80) * 80 + 20);
  for (let y = startY; y < 5000 - cardHeight; y += 80) {
    for (let x = 20; x < containerWidth - cardWidth + 20; x += 260) {
      const overlaps = variables.some((v) => {
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

// Snap coordinates to 20px grid and keep within drag bounds
export function calculateDraggedPosition(
  clientX: number,
  clientY: number,
  startMouseX: number,
  startMouseY: number,
  startCardX: number,
  startCardY: number,
  containerWidth: number,
  containerHeight: number,
  cardWidth = 240,
  cardHeight = 60
): { x: number; y: number } {
  const dx = clientX - startMouseX;
  const dy = clientY - startMouseY;

  let newX = startCardX + dx;
  let newY = startCardY + dy;

  const maxX = containerWidth - cardWidth;
  const maxY = containerHeight - cardHeight;

  newX = Math.max(0, Math.min(newX, maxX));
  newY = Math.max(0, Math.min(newY, maxY));

  const snappedX = Math.round(newX / 20) * 20;
  const snappedY = Math.round(newY / 20) * 20;

  return { x: snappedX, y: snappedY };
}
