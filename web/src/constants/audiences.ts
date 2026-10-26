export interface AudienceOption {
    id: string;
    label: string;
}

// Same values as the profileType saved in users/{uid}.
export const PROFILE_AUDIENCES: AudienceOption[] = [
    { id: "todos", label: "Todos" },
    { id: "estudiante", label: "Estudiantes (todas las carreras)" },
    { id: "egresado", label: "Egresados" },
    { id: "personal_ufps", label: "Personal UFPS (docentes y administrativos)" },
    { id: "invitado", label: "Invitados y comunidad en general" },
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