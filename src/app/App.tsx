import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import { config } from "../lib/config";
import AppShell from "./layout/AppShell";

export function App() {
  return (
    <BrowserRouter
      basename={config.basePath}
    >
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
