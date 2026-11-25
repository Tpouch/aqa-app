import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { markDocument } from "./i18n/lang";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./styles.css";

markDocument();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
