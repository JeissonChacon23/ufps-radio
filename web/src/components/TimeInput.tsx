// src/components/TimeInput.tsx
interface TimeInputProps {
    value: string; // "HH:mm" (24h) or ""
    onChange: (value: string) => void;
    required?: boolean;
    disabled?: boolean;
    /** Optional predicate returning a conflict reason (e.g. program name) if a candidate "HH:mm" start time is unavailable. */
    isTimeDisabled?: (hhmm: string) => string | null;
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
    isTimeDisabled,
}: TimeInputProps) {
    const { hour12, minute, period } = parse24h(value);
    const activePeriod: "AM" | "PM" = hour12 ? period : "AM";

    const findFirstAvailableMinute = (h12: string, p: "AM" | "PM"): string | null => {
        if (!isTimeDisabled) return minute || "00";
        const preferred = minute || "00";
        if (!isTimeDisabled(to24h(h12, preferred, p))) return preferred;
        for (const m of MINUTES) {
            if (!isTimeDisabled(to24h(h12, m, p))) return m;
        }
        return null;
    };

    const isHourFullyBlocked = (h12: string, p: "AM" | "PM"): boolean => {
        if (!isTimeDisabled) return false;
        return MINUTES.every((m) => Boolean(isTimeDisabled(to24h(h12, m, p))));
    };

    const isPeriodFullyBlocked = (p: "AM" | "PM"): boolean => {
        if (!isTimeDisabled) return false;
        return HOURS_12.every((h) => isHourFullyBlocked(h, p));
    };

    const handleHourChange = (newHour12: string) => {
        if (!newHour12) {
            onChange("");
            return;
        }
        const defaultPeriod: "AM" | "PM" = value
            ? period
            : Number(newHour12) >= 6 && Number(newHour12) <= 11
              ? "AM"
              : "PM";
        const chosenPeriod = isHourFullyBlocked(newHour12, defaultPeriod)
            ? defaultPeriod === "AM"
                ? "PM"
                : "AM"
            : defaultPeriod;
        const nextMinute = findFirstAvailableMinute(newHour12, chosenPeriod) ?? (minute || "00");
        onChange(to24h(newHour12, nextMinute, chosenPeriod));
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
        if (!isTimeDisabled) {
            onChange(to24h(effectiveHour, minute || "00", newPeriod));
            return;
        }
        const availMin = findFirstAvailableMinute(effectiveHour, newPeriod);
        if (availMin !== null) {
            onChange(to24h(effectiveHour, availMin, newPeriod));
            return;
        }
        // If current hour is blocked in the new period, jump to the first available hour in that period
        for (const h of HOURS_12) {
            const m = findFirstAvailableMinute(h, newPeriod);
            if (m !== null) {
                onChange(to24h(h, m, newPeriod));
                return;
            }
        }
        onChange(to24h(effectiveHour, minute || "00", newPeriod));
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
                {HOURS_12.map((h) => {
                    const blocked = isHourFullyBlocked(h, activePeriod);
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
                required={required && Boolean(hour12)}
                disabled={disabled}
            >
                <option value="">Min</option>
                {MINUTES.map((m) => {
                    const candidate = hour12 ? to24h(hour12, m, activePeriod) : "";
                    const reason = candidate && isTimeDisabled ? isTimeDisabled(candidate) : null;
                    return (
                        <option key={m} value={m} disabled={Boolean(reason)}>
                            {reason ? `${m} (ocupado)` : m}
                        </option>
                    );
                })}
            </select>
            <select
                aria-label="Periodo AM o PM"
                value={activePeriod}
                onChange={(e) => handlePeriodChange(e.target.value as "AM" | "PM")}
                disabled={disabled}
            >
                <option value="AM" disabled={isPeriodFullyBlocked("AM")}>a. m.</option>
                <option value="PM" disabled={isPeriodFullyBlocked("PM")}>p. m.</option>
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

