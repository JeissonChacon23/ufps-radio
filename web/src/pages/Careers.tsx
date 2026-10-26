import { useEffect, useState } from "react";
import { groupCareers } from "../lib/careers";
import { listCareers, seedCareers } from "../services/careersService";
import type { Career } from "../types";

export default function Careers() {
    const [careers, setCareers] = useState<Career[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        listCareers().then(setCareers);
    }, []);

    const handleSeed = async () => {
        setLoading(true);
        setMessage("");
        try {
            const created = await seedCareers();
            setMessage(
                created === 0 ? "Todas las carreras ya estaban cargadas." : `Se cargaron ${created} carreras.`,
            );
            setCareers(await listCareers());
        } catch {
            setMessage("No se pudieron cargar las carreras.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="card">
                <h2>Carreras ({careers.length})</h2>
                <p>Esta lista alimenta el registro de la app y el público de los eventos.</p>
                <button onClick={handleSeed} disabled={loading}>
                    {loading ? "Cargando…" : "Cargar carreras iniciales"}
                </button>
                {message && <p>{message}</p>}
            </div>

            {groupCareers(careers).map((group) => (
                <div className="card" key={group.title}>
                    <strong>{group.title}</strong>
                    {group.careers.map((c) => (
                        <div key={c.id}>
                            {c.name} {c.modality === "distancia" && <span className="tag">Distancia</span>}
                            {!c.active && <span className="tag">Inactiva</span>}
                        </div>
                    ))}
                </div>
            ))}
        </>
    );
}