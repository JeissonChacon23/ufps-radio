// src/lib/dates.ts
const pad = (n: number) => String(n).padStart(2, "0");

export function toDateInput(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeInput(d: Date): string {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Saved at noon when no time is provided so the calendar day does not shift across time zones.
export function fromDateInput(value: string, time?: string): Date {
    const cleanTime = time && /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : "12:00:00";
    return new Date(`${value}T${cleanTime}`);
}

export function formatDate(d: Date): string {
    return d.toLocaleDateString("es-CO", { dateStyle: "long" });
}

export function formatTime12h(time: string): string {
    if (!time || !/^\d{2}:\d{2}$/.test(time)) return "";
    const [h, m] = time.split(":").map(Number);
    const period = h >= 12 ? "p. m." : "a. m.";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${pad(m)} ${period}`;
}

export function timeToMinutes(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
}

export function currentTimeString(now = new Date()): string {
    return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** ISO weekday: 1 = Monday ... 7 = Sunday */
export function todayIsoWeekday(now = new Date()): number {
    return now.getDay() || 7;
}

export function addMinutes(time: string, minutes: number): string {
    const [h, m] = time.split(":").map(Number);
    const total = ((h * 60 + m + minutes) % (24 * 60) + 24 * 60) % (24 * 60);
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
