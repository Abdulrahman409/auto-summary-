import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { sha256 } from "js-sha256";
window.pmoHash = (s) => sha256(String(s));
const rootEl = document.getElementById("root");
createRoot(rootEl).render(<App mode={rootEl.dataset.mode || "all"} />);
