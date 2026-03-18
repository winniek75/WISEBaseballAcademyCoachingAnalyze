import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CoachAnalyzer from "./CoachAnalyzer";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <CoachAnalyzer />
  </StrictMode>
);
