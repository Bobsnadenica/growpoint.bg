import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { captureInviteTokenFromUrl } from "./lib/auth-flow";
import "./styles/global.css";
import "./sw-register";

// Grab an admin invite token (?invite=...) before routing/social-login strips it.
captureInviteTokenFromUrl();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
