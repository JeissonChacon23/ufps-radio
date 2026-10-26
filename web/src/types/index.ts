export interface RadioEvent {
    id: string;
    title: string;
    audience: string[];
    description: string;
    link: string; // empty string when there is no link
    date: Date;
    endDate: Date | null;
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
}

export type ProgramInput = Omit<Program, "id">;

export type Campus = "cucuta" | "ocana";
export type Modality = "presencial" | "distancia";

export interface Career {
    id: string;
    name: string;
    faculty: string;
    campus: Campus;
    modality: Modality;
    active: boolean;
    order: number;
}