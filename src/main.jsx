import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
// LOC brand fonts, self-hosted (bundled into dist/) — the app makes no
// requests outside Microsoft endpoints; Cybersecurity condition for production.
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/400-italic.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./styles.css";
import { sha256 } from "js-sha256";
window.pmoHash = (s) => sha256(String(s));
const rootEl = document.getElementById("root");
createRoot(rootEl).render(<App mode={rootEl.dataset.mode || "all"} />);
