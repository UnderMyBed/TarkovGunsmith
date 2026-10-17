/**
 * Graphite palette — must stay in sync with `packages/ui/src/styles/index.css`.
 * Satori only understands inline styles, so hex literals are embedded directly
 * in the card JSX instead of CSS custom properties.
 */
export const COLORS = {
  background: "#1a1c20",
  panel: "#24272c",
  line: "#34383f",
  lineStrong: "#454a53",
  divider: "#2c3036",
  foreground: "#e8eaed",
  foreground2: "#c5cad1",
  dim: "#a0a7b1",
  faint: "#888f99",
  accent: "#5fbfb3",
  accentText: "#7fd3c8",
  onAccent: "#0d2422",
  better: "#8ec5ff",
  worse: "#f2a272",
} as const;
