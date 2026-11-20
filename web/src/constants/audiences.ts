// src/constants/audiences.ts
export interface AudienceOption {
    id: string;
    label: string;
}

// Same values as the profileType saved in users/{uid}.
export const PROFILE_AUDIENCES: AudienceOption[] = [
    { id: "todos", label: "Todos (toda la comunidad)" },
    { id: "estudiante", label: "Estudiante" },
    { id: "egresado", label: "Egresado" },
    { id: "docente", label: "Docente" },
    { id: "administrativo", label: "Administrativo" },
    { id: "invitado", label: "Invitado" },
    { id: "externo", label: "Externo" },
];

export const DAYS = [
    { value: 1, label: "Lunes", short: "Lun" },
    { value: 2, label: "Martes", short: "Mar" },
    { value: 3, label: "Miércoles", short: "Mié" },
    { value: 4, label: "Jueves", short: "Jue" },
    { value: 5, label: "Viernes", short: "Vie" },
    { value: 6, label: "Sábado", short: "Sáb" },
    { value: 7, label: "Domingo", short: "Dom" },
];
