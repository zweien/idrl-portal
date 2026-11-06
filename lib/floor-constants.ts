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

// SVG fill for workstation status dots. References the --status-* CSS
// variables in app/globals.css (mapped to the IDRL VI functional colors),
// so the legend, the floor plan dots, and the personnel page all show
// identical colors and follow the active theme automatically.
export const statusColors: Record<string, string> = {
  present: 'fill-[var(--status-present)]',
  absent: 'fill-[var(--status-absent)]',
  trip: 'fill-[var(--status-trip)]',
  leave: 'fill-[var(--status-leave)]',
}

// Same colors as statusColors but as CSS background (for HTML dots, not SVG fill).
export const statusBg: Record<string, string> = {
  present: 'bg-[var(--status-present)]',
  absent: 'bg-[var(--status-absent)]',
  trip: 'bg-[var(--status-trip)]',
  leave: 'bg-[var(--status-leave)]',
}

export const statusLabels: Record<string, string> = {
  present: '在位',
  absent: '未到',
  trip: '出差',
  leave: '请假',
}

// 新建区域的默认颜色：从 IDRL VI 品牌色板（含功能色）中按顺序轮转，
// 选取在深浅主题下均可辨认的中间调（区域描边以 0.6 不透明度渲染）。
export const ZONE_COLOR_PALETTE = [
  '#236db9', // 品牌 blue
  '#56c0e5', // 品牌 cyan
  '#16734a', // success
  '#b5343b', // destructive
  '#8a5200', // warning
  '#203663', // 品牌 navy
] as const
