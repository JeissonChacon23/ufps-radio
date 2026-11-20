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
    code: string,
    name: string,
    faculty: string,
    department: string,
    campus: Campus = "cucuta",
    modality: Modality = "presencial",
    level: AcademicLevel = "pregrado",
    alternateCodes: string[] = [],
): CareerSeed => ({
    id,
    code,
    ...(alternateCodes.length > 0 ? { alternateCodes } : {}),
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
// Official UFPS 3-digit program codes (Divisist): first 3 digits of the 7-digit student code.
export const CAREERS_SEED: CareerSeed[] = [
    // Facultad de Ingeniería - Cúcuta
    seedItem("ingenieria-sistemas", "115", "Ingeniería de Sistemas", ING, D_SIS),
    seedItem("tecnologia-analitica-datos", "215", "Tecnología en Analítica de Datos", ING, D_SIS),
    seedItem("maestria-ingenieria-sistemas", "216", "Maestría en Ingeniería de Sistemas", ING, D_SIS, "cucuta", "presencial", "posgrado"),

    seedItem("ingenieria-civil", "111", "Ingeniería Civil", ING, D_CIV),
    seedItem("tecnologia-obras-civiles", "192", "Tecnología en Obras Civiles", ING, D_CIV),

    seedItem("ingenieria-industrial", "119", "Ingeniería Industrial", ING, D_IND),
    seedItem("tecnologia-procesos-industriales", "198", "Tecnología en Procesos Industriales", ING, D_IND),
    seedItem("tecnologia-gestion-procesos-manufactura", "199", "Tecnología en Gestión de Procesos de Manufactura", ING, D_IND),
    seedItem("tecnologia-productos-ceramicos", "190", "Tecnología en Gestión y Desarrollo de Productos Cerámicos", ING, D_IND),

    seedItem("ingenieria-mecanica", "112", "Ingeniería Mecánica", ING, D_MEC),
    seedItem("ingenieria-electromecanica", "109", "Ingeniería Electromecánica", ING, D_MEC),

    seedItem("ingenieria-electronica", "116", "Ingeniería Electrónica", ING, D_ELE),
    seedItem("ingenieria-minas", "118", "Ingeniería de Minas", ING, D_MIN, "cucuta", "presencial", "pregrado", ["113"]),

    // Facultad de Educación, Artes y Humanidades - Cúcuta
    seedItem("arquitectura", "150", "Arquitectura", EDU, D_ARQ),
    seedItem("derecho", "135", "Derecho", EDU, D_SOC),
    seedItem("comunicacion-social", "133", "Comunicación Social", EDU, D_SOC),
    seedItem("trabajo-social", "134", "Trabajo Social", EDU, D_SOC),
    seedItem("licenciatura-educacion-infantil", "170", "Licenciatura en Educación Infantil", EDU, D_PED),
    seedItem("licenciatura-ciencias-naturales", "137", "Licenciatura en Ciencias Naturales y Educación Ambiental", EDU, D_PED),
    seedItem("maestria-practica-pedagogica", "237", "Maestría en Práctica Pedagógica", EDU, D_PED, "cucuta", "presencial", "posgrado"),

    // Facultad de Ciencias Agrarias y del Ambiente - Cúcuta
    seedItem("ingenieria-biotecnologica", "161", "Ingeniería Biotecnológica", AGR, D_AMB),
    seedItem("ingenieria-ambiental", "165", "Ingeniería Ambiental", AGR, D_AMB),
    seedItem("ingenieria-agronomica", "162", "Ingeniería Agronómica", AGR, D_AGP),
    seedItem("zootecnia", "168", "Zootecnia", AGR, D_AGP, "cucuta", "presencial", "pregrado", ["163"]),
    seedItem("ingenieria-agroindustrial", "164", "Ingeniería Agroindustrial", AGR, D_AGI, "cucuta", "presencial", "pregrado", ["197"]),
    seedItem("tecnologia-agroindustrial", "194", "Tecnología Agroindustrial", AGR, D_AGI, "cucuta", "presencial", "pregrado", ["166", "167"]),

    // Facultad de Ciencias Básicas - Cúcuta
    seedItem("quimica-industrial", "195", "Química Industrial", BAS, D_QUI, "cucuta", "presencial", "pregrado", ["193"]),
    seedItem("licenciatura-matematicas", "136", "Licenciatura en Matemáticas", BAS, D_MAT, "cucuta", "presencial", "pregrado", ["191"]),

    // Facultad de Ciencias Empresariales - Cúcuta
    seedItem("administracion-empresas", "121", "Administración de Empresas", EMP, D_ADM, "cucuta", "presencial", "pregrado", ["124", "125"]),
    seedItem("comercio-internacional", "126", "Comercio Internacional", EMP, D_ADM),
    seedItem("maestria-gerencia-empresas", "221", "Maestría en Gerencia de Empresas", EMP, D_ADM, "cucuta", "presencial", "posgrado"),
    seedItem("contaduria-publica", "122", "Contaduría Pública", EMP, D_CON, "cucuta", "presencial", "pregrado", ["123"]),

    // Facultad de Ciencias de la Salud - Cúcuta
    seedItem("enfermeria", "180", "Enfermería", SAL, D_ENF),
    seedItem("seguridad-salud-trabajo", "181", "Seguridad y Salud en el Trabajo", SAL, D_SST),

    // Educación a Distancia
    seedItem("licenciatura-educacion-comunitaria", "171", "Licenciatura en Educación Comunitaria", DIS, D_DIS, "cucuta", "distancia"),
    seedItem("tecnologia-comercial-financiera", "146", "Tecnología Comercial y Financiera", DIS, D_DIS, "cucuta", "distancia", "pregrado", ["141", "143", "145", "149"]),
    seedItem("tecnologia-regencia-farmacia", "148", "Tecnología en Regencia de Farmacia", DIS, D_DIS, "cucuta", "distancia"),
    seedItem("tecnologia-construcciones-civiles", "142", "Tecnología en Construcciones Civiles", DIS, D_DIS, "cucuta", "distancia"),

    // Ocaña
    seedItem("ingenieria-civil-ocana", "311", "Ingeniería Civil (Ocaña)", ING_O, D_CIV_O, "ocana"),
    seedItem("ingenieria-mecanica-ocana", "312", "Ingeniería Mecánica (Ocaña)", ING_O, D_MEC_O, "ocana"),
    seedItem("ingenieria-sistemas-ocana", "315", "Ingeniería de Sistemas (Ocaña)", ING_O, D_SIS_O, "ocana"),
    seedItem("ingenieria-industrial-ocana", "319", "Ingeniería Industrial (Ocaña)", ING_O, D_IND_O, "ocana"),

    seedItem("zootecnia-ocana", "368", "Zootecnia (Ocaña)", AGR, D_AGR_O, "ocana"),
    seedItem("ingenieria-ambiental-ocana", "365", "Ingeniería Ambiental (Ocaña)", AGR, D_AGR_O, "ocana"),

    seedItem("administracion-empresas-ocana", "321", "Administración de Empresas (Ocaña)", ADM_O, D_ADM_O, "ocana"),
    seedItem("contaduria-publica-diurna-ocana", "322", "Contaduría Pública (Ocaña, diurna)", ADM_O, D_CON_O, "ocana"),
    seedItem("contaduria-publica-nocturna-ocana", "323", "Contaduría Pública (Ocaña, nocturna)", ADM_O, D_CON_O, "ocana"),
    seedItem("tecnologia-gestion-comercial-financiera-ocana", "346", "Tecnología en Gestión Comercial y Financiera (Ocaña)", ADM_O, D_CON_O, "ocana"),

    seedItem("derecho-diurno-ocana", "335", "Derecho (Ocaña, diurna)", EDU, D_HUM_O, "ocana"),
    seedItem("derecho-nocturno-ocana", "336", "Derecho (Ocaña, nocturna)", EDU, D_HUM_O, "ocana"),
    seedItem("comunicacion-social-ocana", "333", "Comunicación Social (Ocaña)", EDU, D_HUM_O, "ocana"),
];

/**
 * Given a 7-digit student code (e.g. "1151594") or a 3-digit program code ("115"),
 * returns the matching Career from the provided catalog.
 */
export function findCareerByStudentCode<T extends Pick<CareerSeed, "code" | "alternateCodes">>(
    studentOrProgramCode: string,
    careers: T[],
): T | null {
    const digits = studentOrProgramCode.replace(/\D+/g, "");
    if (digits.length < 3) return null;
    const prefix = digits.slice(0, 3);
    return (
        careers.find(
            (c) =>
                c.code === prefix ||
                (Array.isArray(c.alternateCodes) && c.alternateCodes.includes(prefix)),
        ) ?? null
    );
}
