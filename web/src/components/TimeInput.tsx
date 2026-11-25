// src/components/TimeInput.tsx
interface TimeInputProps {
    value: string; // "HH:mm" (24h military) or ""
    onChange: (value: string) => void;
    required?: boolean;
    disabled?: boolean;
    /** Optional predicate returning a conflict reason if a candidate "HH:mm" time is unavailable. */
    isTimeDisabled?: (hhmm: string) => string | null;
}

const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function parse24h(value: string): { hour: string; minute: string } {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) {
        return { hour: "", minute: "" };
    }
    const [h, m] = value.split(":").map(Number);
    return {
        hour: String(h).padStart(2, "0"),
        minute: String(m).padStart(2, "0"),
    };
}

export default function TimeInput({
    value,
    onChange,
    required = false,
    disabled = false,
    isTimeDisabled,
}: TimeInputProps) {
    const { hour, minute } = parse24h(value);

    const findFirstAvailableMinute = (h24: string): string | null => {
        if (!isTimeDisabled) return minute || "00";
        const preferred = minute || "00";
        if (!isTimeDisabled(`${h24}:${preferred}`)) return preferred;
        for (const m of MINUTES) {
            if (!isTimeDisabled(`${h24}:${m}`)) return m;
        }
        return null;
    };

    const isHourFullyBlocked = (h24: string): boolean => {
        if (!isTimeDisabled) return false;
        return MINUTES.every((m) => Boolean(isTimeDisabled(`${h24}:${m}`)));
    };

    const handleHourChange = (newHour: string) => {
        if (!newHour) {
            onChange("");
            return;
        }
        const nextMinute = findFirstAvailableMinute(newHour) ?? (minute || "00");
        onChange(`${newHour}:${nextMinute}`);
    };

    const handleMinuteChange = (newMinute: string) => {
        if (!newMinute && !hour) {
            onChange("");
            return;
        }
        const effectiveHour = hour || "08";
        onChange(`${effectiveHour}:${newMinute || "00"}`);
    };

    return (
        <div className="time-picker">
            <select
                aria-label="Hora (formato 24h)"
                value={hour}
                onChange={(e) => handleHourChange(e.target.value)}
                required={required}
                disabled={disabled}
            >
                <option value="">HH</option>
                {HOURS_24.map((h) => {
                    const blocked = isHourFullyBlocked(h);
                    return (
                        <option key={h} value={h} disabled={blocked}>
                            {blocked ? `${h} (ocupada)` : h}
                        </option>
                    );
                })}
            </select>
            <span className="time-sep">:</span>
            <select
                aria-label="Minutos"
                value={minute}
                onChange={(e) => handleMinuteChange(e.target.value)}
                required={required && Boolean(hour)}
                disabled={disabled}
            >
                <option value="">MM</option>
                {MINUTES.map((m) => {
                    const candidate = hour ? `${hour}:${m}` : "";
                    const reason = candidate && isTimeDisabled ? isTimeDisabled(candidate) : null;
                    return (
                        <option key={m} value={m} disabled={Boolean(reason)}>
                            {reason ? `${m} (ocupado)` : m}
                        </option>
                    );
                })}
            </select>
            <span className="time-24h-badge" title="Hora militar (24 horas)">24h</span>
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
