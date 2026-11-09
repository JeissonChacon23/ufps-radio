// src/types/index.ts
export interface RadioEvent {
    id: string;
    title: string;
    audience: string[];
    description: string;
    link: string; // empty string when there is no link
    specialGuest: string; // empty string when there is no special guest
    date: Date;
    endDate: Date | null;
    startTime: string; // "HH:mm"
    endTime: string; // "HH:mm" or ""
}

export type EventInput = Omit<RadioEvent, "id">;

export interface Program {
    id: string;
    name: string;
    days: number[]; // ISO weekdays: 1 = Monday ... 7 = Sunday
    startTime: string; // "HH:mm", Colombia local time
    durationMinutes: number;
    collective: string;
    hosts: string[];
    active: boolean;
    artworkDriveId: string; // Google Drive file ID of the 1024x1024 image
}

export type ProgramInput = Omit<Program, "id">;

export type PodcastStatus = "pendiente" | "en_proceso" | "lista" | "error";

export interface Podcast {
    id: string;
    programId: string;
    programName: string;
    airDate: Date;
    airTime: string; // "HH:mm"
    audioUrl: string; // Drive file ID, same format as Program.artworkDriveId
    imageUrl: string | null; // Drive file ID, or null to use the program image
    status: PodcastStatus;
    errorMessage: string;
}

export type PodcastInput = Pick<
    Podcast,
    "programId" | "programName" | "airDate" | "airTime" | "audioUrl" | "imageUrl"
>;

export type Campus = "cucuta" | "ocana";
export type Modality = "presencial" | "distancia";
export type AcademicLevel = "pregrado" | "posgrado";

export interface Career {
    id: string;
    name: string;
    faculty: string;
    department: string;
    departmentId: string; // e.g. "dept:departamento-de-sistemas-e-informatica"
    level: AcademicLevel;
    campus: Campus;
    modality: Modality;
    active: boolean;
    order: number;
}
