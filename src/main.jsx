import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles.css";
import "./styles/auth-screen.css";
import "./styles/auth-glass.css";
import "./styles/navigation.css";
import "./styles/discipleship-portal.css";
import "./styles/cell-group-management.css";
import "./styles/bible-study.css";
import "./styles/bible-study-reactions.css";
import "./styles/motion-design.css";
import "./styles/member-initials.css";
import "./styles/global-background.css";

const updateServiceWorker = registerSW({
  immediate: true,
  onOfflineReady() {
    console.info("The City on A Hill is ready to work offline.");
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

