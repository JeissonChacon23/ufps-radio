// src/components/Layout.tsx
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Layout() {
    const { logout } = useAuth();
    return (
        <div className="container">
            <header className="nav">
                <strong>UFPS Radio 95.2 · Administración</strong>
                <NavLink to="/events">Eventos</NavLink>
                <NavLink to="/programs">Programación</NavLink>
                <NavLink to="/careers">Carreras</NavLink>
                <button onClick={logout}>Cerrar sesión</button>
            </header>
            <Outlet />
        </div>
    );
}