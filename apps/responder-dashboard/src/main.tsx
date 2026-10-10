// TEMPORARY dev-only harness entry. See README.md.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createDemoApi, HarnessApp } from "./HarnessApp";
import "./harness.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <HarnessApp api={createDemoApi()} />
  </StrictMode>,
);
