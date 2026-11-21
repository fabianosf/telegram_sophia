import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const savedTheme = localStorage.getItem("ts_theme");
document.documentElement.setAttribute(
  "data-theme",
  savedTheme === "dark" ? "dark" : "light"
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
