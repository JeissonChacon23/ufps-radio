// src/components/Layout.tsx
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
    { to: "/inicio", label: "Inicio · Audiencia" },
    { to: "/events", label: "Eventos" },
    { to: "/programs", label: "Programación" },
    { to: "/podcasts", label: "Podcast" },
    { to: "/careers", label: "Estructura UFPS" },
];

export default function Layout() {
    const { logout } = useAuth();

    return (
        <div className="shell">
            <aside className="sidebar">
                <div className="brand">
                    <img
                        src="/favicon.svg"
                        alt="Logo UFPS"
                        className="brand-logo"
                        width={40}
                        height={40}
                    />
                    <div className="brand-text">
                        <div className="brand-title-row">
                            <strong>UFPS Radio 95.2</strong>
                            <span className="brand-dot" title="95.2 FM" aria-hidden="true" />
                        </div>
                        <small>Emisora Institucional · Admin</small>
                    </div>
                </div>

                <nav className="side-nav" aria-label="Secciones">
                    {NAV_ITEMS.map((item) => (
                        <NavLink key={item.to} to={item.to} className="nav-link">
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                <button className="ghost logout" onClick={logout}>Cerrar sesión</button>
            </aside>

            <main className="app-main">
                <Outlet />
            </main>
        </div>
    );
}
