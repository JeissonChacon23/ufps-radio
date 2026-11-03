// src/lib/dates.ts
const pad = (n: number) => String(n).padStart(2, "0");

export function toDateInput(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Saved at noon so the calendar day does not shift across time zones.
export function fromDateInput(value: string): Date {
    return new Date(`${value}T12:00:00`);
}

export function formatDate(d: Date): string {
    return d.toLocaleDateString("es-CO", { dateStyle: "long" });
}

export function addMinutes(time: string, minutes: number): string {
    const [h, m] = time.split(":").map(Number);
    const total = (h * 60 + m + minutes) % (24 * 60);
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

export function startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, amount: number): Date {
    return new Date(d.getFullYear(), d.getMonth() + amount, 1);
}

export function monthLabel(d: Date): string {
    const label = d.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

/** True when the event (or its date range) touches the given month. */
export function overlapsMonth(start: Date, end: Date | null, month: Date): boolean {
    const first = startOfMonth(month);
    const next = addMonths(month, 1);
    const last = end ?? start;
    return start < next && last >= first;
}