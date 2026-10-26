import { createWebApi } from "../client/api.js";
import "./monaco.js";
window.codemap = createWebApi({
  fetch: (url, init) => fetch(url, init),
  eventSource: url => new EventSource(url) as import("../client/api.js").EventStream,
  openUrl: url => { window.open(url, "_blank", "noopener,noreferrer"); },
});
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./app.js";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/sidebar.css";
import "./styles/chat.css";
import "./styles/composer.css";
import "./styles/map.css";
import "./styles/account.css";
import "./styles/web.css";
import "./styles/focus.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
