import type { Career } from "../types";

export type CareerSeed = Omit<Career, "active" | "order">;

const cucuta = (id: string, name: string, faculty: string): CareerSeed =>
    ({ id, name, faculty, campus: "cucuta", modality: "presencial" });

const ocana = (id: string, name: string, faculty: string): CareerSeed =>
    ({ id, name, faculty, campus: "ocana", modality: "presencial" });

const distancia = (id: string, name: string): CareerSeed =>
    ({ id, name, faculty: "Educación a Distancia", campus: "cucuta", modality: "distancia" });

const ING = "Facultad de Ingeniería";
const EDU = "Facultad de Educación, Artes y Humanidades";
const AGR = "Facultad de Ciencias Agrarias y del Ambiente";
const BAS = "Facultad de Ciencias Básicas";
const EMP = "Facultad de Ciencias Empresariales";
const SAL = "Facultad de Ciencias de la Salud";
const ING_O = "Facultad de Ingenierías";
const ADM_O = "Facultad de Ciencias Administrativas y Económicas";

// The array position becomes the "order" field.
export const CAREERS_SEED: CareerSeed[] = [
    // Cúcuta
    cucuta("ingenieria-sistemas", "Ingeniería de Sistemas", ING),
    cucuta("ingenieria-civil", "Ingeniería Civil", ING),
    cucuta("ingenieria-industrial", "Ingeniería Industrial", ING),
    cucuta("ingenieria-mecanica", "Ingeniería Mecánica", ING),
    cucuta("ingenieria-electronica", "Ingeniería Electrónica", ING),
    cucuta("ingenieria-electromecanica", "Ingeniería Electromecánica", ING),
    cucuta("ingenieria-minas", "Ingeniería de Minas", ING),
    cucuta("tecnologia-obras-civiles", "Tecnología en Obras Civiles", ING),
    cucuta("tecnologia-procesos-industriales", "Tecnología en Procesos Industriales", ING),
    cucuta("tecnologia-analitica-datos", "Tecnología en Analítica de Datos", ING),
    cucuta("tecnologia-gestion-procesos-manufactura", "Tecnología en Gestión de Procesos de Manufactura", ING),
    cucuta("tecnologia-productos-ceramicos", "Tecnología en Gestión y Desarrollo de Productos Cerámicos", ING),

    cucuta("arquitectura", "Arquitectura", EDU),
    cucuta("derecho", "Derecho", EDU),
    cucuta("comunicacion-social", "Comunicación Social", EDU),
    cucuta("trabajo-social", "Trabajo Social", EDU),
    cucuta("licenciatura-educacion-infantil", "Licenciatura en Educación Infantil", EDU),
    cucuta("licenciatura-ciencias-naturales", "Licenciatura en Ciencias Naturales y Educación Ambiental", EDU),

    cucuta("ingenieria-biotecnologica", "Ingeniería Biotecnológica", AGR),
    cucuta("ingenieria-ambiental", "Ingeniería Ambiental", AGR),
    cucuta("ingenieria-agronomica", "Ingeniería Agronómica", AGR),
    cucuta("ingenieria-agroindustrial", "Ingeniería Agroindustrial", AGR),
    cucuta("zootecnia", "Zootecnia", AGR),
    cucuta("tecnologia-agroindustrial", "Tecnología Agroindustrial", AGR),

    cucuta("quimica-industrial", "Química Industrial", BAS),
    cucuta("licenciatura-matematicas", "Licenciatura en Matemáticas", BAS),

    cucuta("administracion-empresas", "Administración de Empresas", EMP),
    cucuta("contaduria-publica", "Contaduría Pública", EMP),
    cucuta("comercio-internacional", "Comercio Internacional", EMP),

    cucuta("enfermeria", "Enfermería", SAL),
    cucuta("seguridad-salud-trabajo", "Seguridad y Salud en el Trabajo", SAL),

    distancia("licenciatura-educacion-comunitaria", "Licenciatura en Educación Comunitaria"),
    distancia("tecnologia-comercial-financiera", "Tecnología Comercial y Financiera"),
    distancia("tecnologia-regencia-farmacia", "Tecnología en Regencia de Farmacia"),
    distancia("tecnologia-construcciones-civiles", "Tecnología en Construcciones Civiles"),

    // Ocaña
    ocana("ingenieria-civil-ocana", "Ingeniería Civil (Ocaña)", ING_O),
    ocana("ingenieria-mecanica-ocana", "Ingeniería Mecánica (Ocaña)", ING_O),
    ocana("ingenieria-sistemas-ocana", "Ingeniería de Sistemas (Ocaña)", ING_O),
    ocana("ingenieria-industrial-ocana", "Ingeniería Industrial (Ocaña)", ING_O),

    ocana("zootecnia-ocana", "Zootecnia (Ocaña)", AGR),
    ocana("ingenieria-ambiental-ocana", "Ingeniería Ambiental (Ocaña)", AGR),

    ocana("administracion-empresas-ocana", "Administración de Empresas (Ocaña)", ADM_O),
    ocana("contaduria-publica-diurna-ocana", "Contaduría Pública (Ocaña, diurna)", ADM_O),
    ocana("contaduria-publica-nocturna-ocana", "Contaduría Pública (Ocaña, nocturna)", ADM_O),
    ocana("tecnologia-gestion-comercial-financiera-ocana", "Tecnología en Gestión Comercial y Financiera (Ocaña)", ADM_O),

    ocana("derecho-diurno-ocana", "Derecho (Ocaña, diurna)", EDU),
    ocana("derecho-nocturno-ocana", "Derecho (Ocaña, nocturna)", EDU),
    ocana("comunicacion-social-ocana", "Comunicación Social (Ocaña)", EDU),
];