// src/components/DriveImage.tsx
import { useState } from "react";
import { driveImageCandidates } from "../lib/drive";

interface Props {
    id: string;
    size?: number;
    className?: string;
    alt?: string;
    onAllFailed?: () => void;
}

export default function DriveImage({
                                       id,
                                       size = 256,
                                       className = "thumb",
                                       alt = "",
                                       onAllFailed,
                                   }: Props) {
    const candidates = driveImageCandidates(id, size);
    const [attempt, setAttempt] = useState({ id, index: 0 });
    // Start again from the first URL when the file changes.
    const index = attempt.id === id ? attempt.index : 0;

    if (index >= candidates.length) {
        return <div className={`${className} placeholder`} title="No se pudo cargar la imagen" />;
    }

    return (
        <img
            className={className}
            src={candidates[index]}
            alt={alt}
            referrerPolicy="no-referrer"
            onError={() => {
                const next = index + 1;
                setAttempt({ id, index: next });
                if (next >= candidates.length) onAllFailed?.();
            }}
        />
    );
}