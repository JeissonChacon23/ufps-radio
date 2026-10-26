// src/components/ProtectedRoute.tsx
import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
    const { user, isAdmin, loading, logout } = useAuth();

    if (loading) return <p>Cargando…</p>;
    if (!user) return <Navigate to="/login" replace />;
    if (!isAdmin) {
        return (
            <div>
                <p>Tu cuenta no tiene permisos de administrador.</p>
                <button onClick={logout}>Cerrar sesión</button>
            </div>
        );
    }
    return <>{children}</>;
}