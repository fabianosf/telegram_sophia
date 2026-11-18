import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Clock from "./Clock";

export default function Layout() {
  const { logout } = useAuth();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>TelegramSophia</h1>
          <Clock />
        </div>
        <div className="row-actions">
          <nav className="tabs">
            <NavLink to="/contas" className={({ isActive }) => (isActive ? "active" : "")}>
              Contas
            </NavLink>
            <NavLink
              to="/agendamentos"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Agendamentos
            </NavLink>
          </nav>
          <button className="ghost" type="button" onClick={logout}>
            Sair
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
