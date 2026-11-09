// src/pages/Login.tsx
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
    const { user, login } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    if (user) return <Navigate to="/events" replace />;

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        try {
            await login(email, password);
        } catch {
            setError("Correo o contraseña incorrectos.");
        }
    };

    return (
        <div className="login-wrap">
            <form className="container card login-card" onSubmit={handleSubmit}>
                <div className="login-brand">
                    <img src="/ufps-horizontal.png" alt="Universidad Francisco de Paula Santander" className="login-logo" />
                    <div className="login-station">
                        <span className="brand-dot" aria-hidden="true" />
                        <strong>UFPS Radio 95.2 F.M.</strong>
                    </div>
                </div>
                <h2>Panel de administración</h2>
                <label>Correo institucional
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </label>
                <label>Contraseña
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </label>
                {error && <p className="error">{error}</p>}
                <button type="submit">Entrar</button>
            </form>
        </div>
    );
}
