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