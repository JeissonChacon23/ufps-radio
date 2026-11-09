// src/lib/careers.ts
import type { Campus, Career } from "../types";

export function careerGroup(career: Career): string {
    return career.campus === "ocana" ? `Ocaña · ${career.faculty}` : career.faculty;
}

export interface DepartmentGroup {
    departmentId: string;
    department: string;
    careers: Career[];
}

export interface FacultyHierarchy {
    title: string;
    faculty: string;
    campus: Campus;
    departments: DepartmentGroup[];
}

export function groupCareers(careers: Career[]): { title: string; careers: Career[] }[] {
    const groups = new Map<string, Career[]>();
    for (const career of careers) {
        const key = careerGroup(career);
        groups.set(key, [...(groups.get(key) ?? []), career]);
    }
    return [...groups].map(([title, items]) => ({ title, careers: items }));
}

export function groupByFacultyAndDepartment(careers: Career[]): FacultyHierarchy[] {
    const facultyMap = new Map<string, {
        title: string;
        faculty: string;
        campus: Campus;
        deptMap: Map<string, DepartmentGroup>;
    }>();

    for (const career of careers) {
        const fKey = careerGroup(career);
        let fEntry = facultyMap.get(fKey);
        if (!fEntry) {
            fEntry = {
                title: fKey,
                faculty: career.faculty,
                campus: career.campus,
                deptMap: new Map(),
            };
            facultyMap.set(fKey, fEntry);
        }
        const dKey = career.departmentId || career.department;
        let dEntry = fEntry.deptMap.get(dKey);
        if (!dEntry) {
            dEntry = {
                departmentId: career.departmentId,
                department: career.department,
                careers: [],
            };
            fEntry.deptMap.set(dKey, dEntry);
        }
        dEntry.careers.push(career);
    }

    return [...facultyMap.values()].map((f) => ({
        title: f.title,
        faculty: f.faculty,
        campus: f.campus,
        departments: [...f.deptMap.values()],
    }));
}
