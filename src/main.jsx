import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles.css";
import "./styles/discipleship-portal.css";
import "./styles/cell-group-management.css";
import "./styles/bible-study.css";
import "./styles/bible-study-reactions.css";

const updateServiceWorker = registerSW({
  immediate: true,
  onOfflineReady() {
    console.info("Glory Carriers is ready to work offline.");
  },
  onNeedRefresh() {
    updateServiceWorker(true);
  }
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
