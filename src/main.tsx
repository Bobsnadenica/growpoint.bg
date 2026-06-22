import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { captureInviteTokenFromUrl, captureReferralFromUrl } from "./lib/auth-flow";
import "./styles/global.css";
import "./sw-register";

// Grab an admin invite token (?invite=...) and a referral code (?ref=...) before
// routing/social-login strips them from the URL.
captureInviteTokenFromUrl();
captureReferralFromUrl();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
