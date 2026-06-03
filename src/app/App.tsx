import { HashRouter } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import AppShell from "./layout/AppShell";

export function App() {
  return (
    <HashRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </HashRouter>
  );
}
