import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import { config } from "../lib/config";
import AppShell from "./layout/AppShell";

export function App() {
  return (
    <BrowserRouter
      basename={config.basePath}
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
