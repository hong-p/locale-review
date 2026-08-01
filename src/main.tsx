import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { runStorageMigrations } from "./storage/legacyMigration";
import "./styles/global.css";

// plan.md 5.3: strip the prototype's plain-text token before anything reads
// browser storage.
runStorageMigrations();

const container = document.getElementById("root");
if (!container) throw new Error("Root container #root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
