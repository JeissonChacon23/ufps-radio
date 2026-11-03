// src/components/Layout.tsx
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
    { to: "/events", label: "Eventos" },
    { to: "/programs", label: "Programación" },
    { to: "/podcasts", label: "Podcast" },
    { to: "/careers", label: "Carreras" },
];

export default function Layout() {
    const { logout } = useAuth();

    return (
        <div className="shell">
            <aside className="sidebar">
                <div className="brand">
                    <span className="brand-dot" aria-hidden="true" />
                    <div>
                        <strong>UFPS Radio 95.2</strong>
                        <small>Administración</small>
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