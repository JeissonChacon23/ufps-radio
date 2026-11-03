// src/components/MonthNav.tsx
import { addMonths, monthLabel, startOfMonth } from "../lib/dates";

interface Props {
    month: Date;
    onChange: (month: Date) => void;
}

export default function MonthNav({ month, onChange }: Props) {
    return (
        <div className="month-nav">
            <button type="button" className="ghost icon" aria-label="Mes anterior" onClick={() => onChange(addMonths(month, -1))}>‹</button>
            <strong className="month-label">{monthLabel(month)}</strong>
            <button type="button" className="ghost icon" aria-label="Mes siguiente" onClick={() => onChange(addMonths(month, 1))}>›</button>
            <button type="button" className="ghost" onClick={() => onChange(startOfMonth(new Date()))}>Hoy</button>
        </div>
    );
}