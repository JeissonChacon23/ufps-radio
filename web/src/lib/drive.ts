// src/lib/drive.ts

/** Extracts the Google Drive file ID from any common share link. */
export function extractDriveId(text: string): string | null {
    const value = text.trim();
    if (!value) return null;

    const patterns = [
        /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
        /[?&]id=([a-zA-Z0-9_-]{10,})/,
        /\/d\/([a-zA-Z0-9_-]{10,})/,
    ];
    for (const pattern of patterns) {
        const match = value.match(pattern);
        if (match) return match[1];
    }
    // The person pasted only the ID.
    return /^[a-zA-Z0-9_-]{20,}$/.test(value) ? value : null;
}

/** Message to show when the pasted text is not a usable file link, or null when it is fine. */
export function driveLinkError(text: string): string | null {
    if (!text.trim()) return null;
    if (/\/folders\//.test(text)) {
        return "Ese es el enlace de una carpeta. Abre el archivo y copia el enlace del archivo.";
    }
    return extractDriveId(text) ? null : "Ese enlace no es de un archivo de Google Drive.";
}

// URLs are built only here, so a change on Google's side is a one-line fix.
// Several image URLs are tried in order because Google does not document them as an API.
export const driveImageCandidates = (id: string, size = 512) => [
    `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`,
    `https://lh3.googleusercontent.com/d/${id}=w${size}`,
    `https://drive.google.com/uc?export=view&id=${id}`,
];

export const driveImageUrl = (id: string, size = 512) => driveImageCandidates(id, size)[0];

export const driveAudioUrl = (id: string) =>
    `https://drive.google.com/uc?export=download&id=${id}`;

export const driveViewUrl = (id: string) =>
    `https://drive.google.com/file/d/${id}/view`;