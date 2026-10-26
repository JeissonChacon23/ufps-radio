import type { Career } from "../types";

export function careerGroup(career: Career): string {
    return career.campus === "ocana" ? `Ocaña · ${career.faculty}` : career.faculty;
}

export function groupCareers(careers: Career[]): { title: string; careers: Career[] }[] {
    const groups = new Map<string, Career[]>();
    for (const career of careers) {
        const key = careerGroup(career);
        groups.set(key, [...(groups.get(key) ?? []), career]);
    }
    return [...groups].map(([title, items]) => ({ title, careers: items }));
}