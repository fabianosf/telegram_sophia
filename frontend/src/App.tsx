import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import Layout from "./components/Layout";
import Accounts from "./pages/Accounts";
import Login from "./pages/Login";
import Schedules from "./pages/Schedules";
import Settings from "./pages/Settings";
import { PrefsProvider } from "./prefs";

export default function App() {
  return (
    <PrefsProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Navigate to="/contas" replace />} />
                <Route path="/contas" element={<Accounts />} />
                <Route path="/agendamentos" element={<Schedules />} />
                <Route path="/configuracao" element={<Settings />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/contas" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </PrefsProvider>
  );
}
