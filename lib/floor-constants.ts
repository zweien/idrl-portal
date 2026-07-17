export const CELL_W = 70
export const CELL_H = 50
export const CELL_GAP = 6
export const ZONE_PAD = 16
export const ZONE_TITLE_H = 24
export const ZONE_GAP_X = 20
export const ZONE_GAP_Y = 20
export const ZONES_PER_ROW = 3

// Vertical space reserved below the zones for the in-SVG status legend
// (title + 4 status rows). Without this the legend overlaps the bottom-right zone.
export const LEGEND_HEIGHT = 80

// SVG fill for workstation status dots. Kept in sync with the --status-* CSS
// variables in app/globals.css (same oklch values) so the legend, the floor
// plan dots, and the personnel page all show identical colors.
export const statusColors: Record<string, string> = {
  present: 'fill-[oklch(0.62_0.17_145)]',
  absent: 'fill-[oklch(0.58_0.20_25)]',
  trip: 'fill-[oklch(0.55_0.18_255)]',
  leave: 'fill-[oklch(0.72_0.15_65)]',
}

// Same colors as statusColors but as CSS background (for HTML dots, not SVG fill).
export const statusBg: Record<string, string> = {
  present: 'bg-[oklch(0.62_0.17_145)]',
  absent: 'bg-[oklch(0.58_0.20_25)]',
  trip: 'bg-[oklch(0.55_0.18_255)]',
  leave: 'bg-[oklch(0.72_0.15_65)]',
}

export const statusLabels: Record<string, string> = {
  present: '在位',
  absent: '未到',
  trip: '出差',
  leave: '请假',
}
