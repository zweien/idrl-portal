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

export const statusColors: Record<string, string> = {
  online: 'fill-[oklch(0.7_0.2_145)]',
  offline: 'fill-[oklch(0.4_0.02_260)]',
  busy: 'fill-[oklch(0.65_0.2_45)]',
  leave: 'fill-[oklch(0.5_0.15_300)]',
}

export const statusLabels: Record<string, string> = {
  online: '在位',
  offline: '离开',
  busy: '忙碌',
  leave: '请假',
}
