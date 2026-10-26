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
        <form className="container card" onSubmit={handleSubmit}>
            <h2>Iniciar sesión</h2>
            <label>Correo
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>Contraseña
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit">Entrar</button>
        </form>
    );
}