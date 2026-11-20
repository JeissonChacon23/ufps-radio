// src/App.tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Events from "./pages/Events";
import Programs from "./pages/Programs";
import Podcasts from "./pages/Podcasts";
import Careers from "./pages/Careers";

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                        <Route path="/inicio" element={<Home />} />
                        <Route path="/events" element={<Events />} />
                        <Route path="/programs" element={<Programs />} />
                        <Route path="/podcasts" element={<Podcasts />} />
                        <Route path="/careers" element={<Careers />} />
                    </Route>
                    <Route path="*" element={<Navigate to="/inicio" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}