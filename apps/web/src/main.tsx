import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.js";
import { startObservability } from "./observability/start.js";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root container #root not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// After first render: Faro loads as its own chunk once the page has loaded.
startObservability();
