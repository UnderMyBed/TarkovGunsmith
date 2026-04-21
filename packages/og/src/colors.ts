/**
 * Field Ledger palette — must stay in sync with `packages/ui/src/styles/index.css`.
 * Satori only understands inline styles, so hex literals are embedded directly
 * in the card JSX instead of CSS custom properties.
 */
export const COLORS = {
  background: "#0e0f0c",
  foreground: "#e6e4db",
  paperDim: "#9a988d",
  border: "#3a3d33",
  lineMuted: "#26291f",
  card: "#16170f",
  amber: "#f59e0b",
  amberDeep: "#b45309",
  olive: "#7a8b3f",
  rust: "#9c3f1e",
  blood: "#b91c1c",
} as const;
