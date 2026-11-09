// src/components/TimeInput.tsx
interface TimeInputProps {
    value: string; // "HH:mm" (24h) or ""
    onChange: (value: string) => void;
    required?: boolean;
    disabled?: boolean;
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function parse24h(value: string): { hour12: string; minute: string; period: "AM" | "PM" } {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) {
        return { hour12: "", minute: "", period: "AM" };
    }
    const [h24, m] = value.split(":").map(Number);
    const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return {
        hour12: String(h12).padStart(2, "0"),
        minute: String(m).padStart(2, "0"),
        period,
    };
}

function to24h(hour12: string, minute: string, period: "AM" | "PM"): string {
    if (!hour12) return "";
    const h12 = Number(hour12);
    const m = Number(minute || "0");
    let h24 = h12 % 12;
    if (period === "PM") h24 += 12;
    return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function TimeInput({
    value,
    onChange,
    required = false,
    disabled = false,
}: TimeInputProps) {
    const { hour12, minute, period } = parse24h(value);

    const handleHourChange = (newHour12: string) => {
        if (!newHour12) {
            onChange("");
            return;
        }
        // Auto-complete minutes and default period when picking an hour for the first time
        const nextMinute = minute || "00";
        const defaultPeriod: "AM" | "PM" = value
            ? period
            : Number(newHour12) >= 6 && Number(newHour12) <= 11
              ? "AM"
              : "PM";
        onChange(to24h(newHour12, nextMinute, defaultPeriod));
    };

    const handleMinuteChange = (newMinute: string) => {
        if (!newMinute && !hour12) {
            onChange("");
            return;
        }
        const effectiveHour = hour12 || "08";
        const effectivePeriod = value ? period : "AM";
        onChange(to24h(effectiveHour, newMinute || "00", effectivePeriod));
    };

    const handlePeriodChange = (newPeriod: "AM" | "PM") => {
        const effectiveHour = hour12 || "08";
        const effectiveMinute = minute || "00";
        onChange(to24h(effectiveHour, effectiveMinute, newPeriod));
    };

    return (
        <div className="time-picker">
            <select
                aria-label="Hora"
                value={hour12}
                onChange={(e) => handleHourChange(e.target.value)}
                required={required}
                disabled={disabled}
            >
                <option value="">Hora</option>
                {HOURS_12.map((h) => (
                    <option key={h} value={h}>{h}</option>
                ))}
            </select>
            <span className="time-sep">:</span>
            <select
                aria-label="Minutos"
                value={minute}
                onChange={(e) => handleMinuteChange(e.target.value)}
                required={required && Boolean(hour12)}
                disabled={disabled}
            >
                <option value="">Min</option>
                {MINUTES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                ))}
            </select>
            <select
                aria-label="Periodo AM o PM"
                value={hour12 ? period : "AM"}
                onChange={(e) => handlePeriodChange(e.target.value as "AM" | "PM")}
                disabled={disabled}
            >
                <option value="AM">a. m.</option>
                <option value="PM">p. m.</option>
            </select>
            {!required && value && !disabled && (
                <button
                    type="button"
                    className="ghost time-clear"
                    onClick={() => onChange("")}
                    title="Quitar hora"
                >
                    ✕
                </button>
            )}
        </div>
    );
}

