// src/data/careersSeed.ts
import { slugify } from "../lib/text";
import type { AcademicLevel, Campus, Career, Modality } from "../types";

export type CareerSeed = Omit<Career, "active" | "order">;

export function makeDepartmentId(department: string, campus: Campus = "cucuta"): string {
    const slug = slugify(department);
    return campus === "ocana" && !slug.includes("ocana")
        ? `dept:${slug}-ocana`
        : `dept:${slug}`;
}

const seedItem = (
    id: string,
    name: string,
    faculty: string,
    department: string,
    campus: Campus = "cucuta",
    modality: Modality = "presencial",
    level: AcademicLevel = "pregrado",
): CareerSeed => ({
    id,
    name,
    faculty,
    department,
    departmentId: makeDepartmentId(department, campus),
    level,
    campus,
    modality,
});

const ING = "Facultad de Ingeniería";
const EDU = "Facultad de Educación, Artes y Humanidades";
const AGR = "Facultad de Ciencias Agrarias y del Ambiente";
const BAS = "Facultad de Ciencias Básicas";
const EMP = "Facultad de Ciencias Empresariales";
const SAL = "Facultad de Ciencias de la Salud";
const DIS = "Educación a Distancia";
const ING_O = "Facultad de Ingenierías";
const ADM_O = "Facultad de Ciencias Administrativas y Económicas";

// Departamentos Cúcuta
const D_SIS = "Departamento de Sistemas e Informática";
const D_CIV = "Departamento de Construcciones Civiles, Vías y Transporte";
const D_IND = "Departamento de Procesos Industriales";
const D_MEC = "Departamento de Diseño Mecánico, Materiales y Procesos";
const D_ELE = "Departamento de Electricidad y Electrónica";
const D_MIN = "Departamento de Geotecnia y Minería";

const D_ARQ = "Departamento de Arquitectura, Diseño y Urbanismo";
const D_SOC = "Departamento de Estudios Sociales y Humanos";
const D_PED = "Departamento de Pedagogía, Andragogía, Comunicación y Multimedios";

const D_AMB = "Departamento de Ciencias del Medio Ambiente";
const D_AGP = "Departamento de Ciencias Agrícolas y Pecuarias";
const D_AGI = "Departamento de Ciencias Agroindustriales";

const D_QUI = "Departamento de Química";
const D_MAT = "Departamento de Matemáticas y Estadística";

const D_ADM = "Departamento de Ciencias Administrativas";
const D_CON = "Departamento de Ciencias Contables y Financieras";

const D_ENF = "Departamento de Enfermería";
const D_SST = "Departamento de Seguridad y Salud en el Trabajo";

const D_DIS = "Departamento de Estudios a Distancia";

// Departamentos Ocaña
const D_SIS_O = "Departamento de Sistemas e Informática (Ocaña)";
const D_CIV_O = "Departamento de Ingeniería Civil (Ocaña)";
const D_MEC_O = "Departamento de Ingeniería Mecánica (Ocaña)";
const D_IND_O = "Departamento de Ingeniería Industrial (Ocaña)";
const D_AGR_O = "Departamento de Ciencias Agrarias y del Ambiente (Ocaña)";
const D_ADM_O = "Departamento de Ciencias Administrativas (Ocaña)";
const D_CON_O = "Departamento de Ciencias Contables y Financieras (Ocaña)";
const D_HUM_O = "Departamento de Humanidades y Artes (Ocaña)";

// The array position becomes the "order" field.
export const CAREERS_SEED: CareerSeed[] = [
    // Facultad de Ingeniería - Cúcuta
    seedItem("ingenieria-sistemas", "Ingeniería de Sistemas", ING, D_SIS),
    seedItem("tecnologia-analitica-datos", "Tecnología en Analítica de Datos", ING, D_SIS),
    seedItem("maestria-ingenieria-sistemas", "Maestría en Ingeniería de Sistemas", ING, D_SIS, "cucuta", "presencial", "posgrado"),

    seedItem("ingenieria-civil", "Ingeniería Civil", ING, D_CIV),
    seedItem("tecnologia-obras-civiles", "Tecnología en Obras Civiles", ING, D_CIV),

    seedItem("ingenieria-industrial", "Ingeniería Industrial", ING, D_IND),
    seedItem("tecnologia-procesos-industriales", "Tecnología en Procesos Industriales", ING, D_IND),
    seedItem("tecnologia-gestion-procesos-manufactura", "Tecnología en Gestión de Procesos de Manufactura", ING, D_IND),
    seedItem("tecnologia-productos-ceramicos", "Tecnología en Gestión y Desarrollo de Productos Cerámicos", ING, D_IND),

    seedItem("ingenieria-mecanica", "Ingeniería Mecánica", ING, D_MEC),
    seedItem("ingenieria-electromecanica", "Ingeniería Electromecánica", ING, D_MEC),

    seedItem("ingenieria-electronica", "Ingeniería Electrónica", ING, D_ELE),
    seedItem("ingenieria-minas", "Ingeniería de Minas", ING, D_MIN),

    // Facultad de Educación, Artes y Humanidades - Cúcuta
    seedItem("arquitectura", "Arquitectura", EDU, D_ARQ),
    seedItem("derecho", "Derecho", EDU, D_SOC),
    seedItem("comunicacion-social", "Comunicación Social", EDU, D_SOC),
    seedItem("trabajo-social", "Trabajo Social", EDU, D_SOC),
    seedItem("licenciatura-educacion-infantil", "Licenciatura en Educación Infantil", EDU, D_PED),
    seedItem("licenciatura-ciencias-naturales", "Licenciatura en Ciencias Naturales y Educación Ambiental", EDU, D_PED),
    seedItem("maestria-practica-pedagogica", "Maestría en Práctica Pedagógica", EDU, D_PED, "cucuta", "presencial", "posgrado"),

    // Facultad de Ciencias Agrarias y del Ambiente - Cúcuta
    seedItem("ingenieria-biotecnologica", "Ingeniería Biotecnológica", AGR, D_AMB),
    seedItem("ingenieria-ambiental", "Ingeniería Ambiental", AGR, D_AMB),
    seedItem("ingenieria-agronomica", "Ingeniería Agronómica", AGR, D_AGP),
    seedItem("zootecnia", "Zootecnia", AGR, D_AGP),
    seedItem("ingenieria-agroindustrial", "Ingeniería Agroindustrial", AGR, D_AGI),
    seedItem("tecnologia-agroindustrial", "Tecnología Agroindustrial", AGR, D_AGI),

    // Facultad de Ciencias Básicas - Cúcuta
    seedItem("quimica-industrial", "Química Industrial", BAS, D_QUI),
    seedItem("licenciatura-matematicas", "Licenciatura en Matemáticas", BAS, D_MAT),

    // Facultad de Ciencias Empresariales - Cúcuta
    seedItem("administracion-empresas", "Administración de Empresas", EMP, D_ADM),
    seedItem("comercio-internacional", "Comercio Internacional", EMP, D_ADM),
    seedItem("maestria-gerencia-empresas", "Maestría en Gerencia de Empresas", EMP, D_ADM, "cucuta", "presencial", "posgrado"),
    seedItem("contaduria-publica", "Contaduría Pública", EMP, D_CON),

    // Facultad de Ciencias de la Salud - Cúcuta
    seedItem("enfermeria", "Enfermería", SAL, D_ENF),
    seedItem("seguridad-salud-trabajo", "Seguridad y Salud en el Trabajo", SAL, D_SST),

    // Educación a Distancia
    seedItem("licenciatura-educacion-comunitaria", "Licenciatura en Educación Comunitaria", DIS, D_DIS, "cucuta", "distancia"),
    seedItem("tecnologia-comercial-financiera", "Tecnología Comercial y Financiera", DIS, D_DIS, "cucuta", "distancia"),
    seedItem("tecnologia-regencia-farmacia", "Tecnología en Regencia de Farmacia", DIS, D_DIS, "cucuta", "distancia"),
    seedItem("tecnologia-construcciones-civiles", "Tecnología en Construcciones Civiles", DIS, D_DIS, "cucuta", "distancia"),

    // Ocaña
    seedItem("ingenieria-civil-ocana", "Ingeniería Civil (Ocaña)", ING_O, D_CIV_O, "ocana"),
    seedItem("ingenieria-mecanica-ocana", "Ingeniería Mecánica (Ocaña)", ING_O, D_MEC_O, "ocana"),
    seedItem("ingenieria-sistemas-ocana", "Ingeniería de Sistemas (Ocaña)", ING_O, D_SIS_O, "ocana"),
    seedItem("ingenieria-industrial-ocana", "Ingeniería Industrial (Ocaña)", ING_O, D_IND_O, "ocana"),

    seedItem("zootecnia-ocana", "Zootecnia (Ocaña)", AGR, D_AGR_O, "ocana"),
    seedItem("ingenieria-ambiental-ocana", "Ingeniería Ambiental (Ocaña)", AGR, D_AGR_O, "ocana"),

    seedItem("administracion-empresas-ocana", "Administración de Empresas (Ocaña)", ADM_O, D_ADM_O, "ocana"),
    seedItem("contaduria-publica-diurna-ocana", "Contaduría Pública (Ocaña, diurna)", ADM_O, D_CON_O, "ocana"),
    seedItem("contaduria-publica-nocturna-ocana", "Contaduría Pública (Ocaña, nocturna)", ADM_O, D_CON_O, "ocana"),
    seedItem("tecnologia-gestion-comercial-financiera-ocana", "Tecnología en Gestión Comercial y Financiera (Ocaña)", ADM_O, D_CON_O, "ocana"),

    seedItem("derecho-diurno-ocana", "Derecho (Ocaña, diurna)", EDU, D_HUM_O, "ocana"),
    seedItem("derecho-nocturno-ocana", "Derecho (Ocaña, nocturna)", EDU, D_HUM_O, "ocana"),
    seedItem("comunicacion-social-ocana", "Comunicación Social (Ocaña)", EDU, D_HUM_O, "ocana"),
];
