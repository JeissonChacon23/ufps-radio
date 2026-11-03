// src/components/DriveImageField.tsx
import { useState } from "react";
import DriveImage from "./DriveImage";
import { driveLinkError, extractDriveId } from "../lib/drive";

interface Props {
    label: string;
    value: string;
    onChange: (value: string) => void;
    required?: boolean;
    hint?: string;
}

export default function DriveImageField({
                                            label,
                                            value,
                                            onChange,
                                            required = true,
                                            hint = "Imagen cuadrada de 1024 × 1024 px.",
                                        }: Props) {
    const id = extractDriveId(value);
    const linkError = driveLinkError(value);
    const [failedId, setFailedId] = useState<string | null>(null);
    const failed = id !== null && failedId === id;

    return (
        <div className="drive-field">
            <label>{label}
                <input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Pega el enlace de Google Drive"
                    required={required}
                />
            </label>

            {linkError && <p className="error">{linkError}</p>}

            {id && !failed && (
                <DriveImage id={id} size={256} alt="Vista previa" onAllFailed={() => setFailedId(id)} />
            )}
            {id && failed && (
                <p className="error">
                    No se pudo cargar la imagen. Abre el enlace en una ventana privada: si pide iniciar
                    sesión, cambia el acceso general a «Cualquier persona con el enlace» con rol de Lector.
                </p>
            )}

            <p className="muted">{hint}</p>
        </div>
    );
}