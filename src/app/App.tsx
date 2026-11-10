import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import { config } from "../lib/config";
import AppShell from "./layout/AppShell";
import MaintenanceGate from "./components/MaintenanceGate";

export function App() {
  return (
    <BrowserRouter
      basename={config.basePath}
    >
      <AuthProvider>
        <MaintenanceGate><AppShell /></MaintenanceGate>
      </AuthProvider>
    </BrowserRouter>
  );
}
