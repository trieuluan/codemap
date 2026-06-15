import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app.js";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/sidebar.css";
import "./styles/launcher.css";
import "./styles/chat.css";
import "./styles/composer.css";
import "./styles/map.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
