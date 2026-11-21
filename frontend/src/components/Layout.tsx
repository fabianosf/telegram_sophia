import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { usePrefs } from "../prefs";
import Clock from "./Clock";

export default function Layout() {
  const { logout } = useAuth();
  const { theme, lang, setTheme, setLang, t } = usePrefs();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>{t("brand")}</h1>
          <Clock />
        </div>
        <div className="row-actions topbar-actions">
          <nav className="tabs">
            <NavLink to="/contas" className={({ isActive }) => (isActive ? "active" : "")}>
              {t("nav_accounts")}
            </NavLink>
            <NavLink
              to="/agendamentos"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {t("nav_schedules")}
            </NavLink>
            <NavLink
              to="/configuracao"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {t("nav_settings")}
            </NavLink>
          </nav>
          <div className="prefs-toggles">
            <button
              type="button"
              className={`ghost compact ${theme === "light" ? "active-toggle" : ""}`}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              title={theme === "light" ? t("theme_dark") : t("theme_light")}
            >
              {theme === "light" ? t("theme_dark") : t("theme_light")}
            </button>
            <button
              type="button"
              className={`ghost compact ${lang === "pt" ? "active-toggle" : ""}`}
              onClick={() => setLang(lang === "pt" ? "en" : "pt")}
            >
              {lang === "pt" ? t("lang_en") : t("lang_pt")}
            </button>
            <button className="ghost" type="button" onClick={logout}>
              {t("logout")}
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
