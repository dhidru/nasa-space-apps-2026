/** Landing Time (UTC) picker, limited to the Supported Span and the 10-minute grid (data-contract §2). */
import { useEffect, useState } from "react";
import { DAY_MS, formatUtc, HOUR_MS, parseUtc, snapLandingTime, SPAN_END, SPAN_START, STAY_STEPS, STEP_MS, STEP_S } from "../../science/time";

const toInput = (t: number) => formatUtc(t).slice(0, 16); // "2027-03-01T00:00"

export function LandingTimePicker({ value, onChange }: { value: number; onChange: (t: number) => void }) {
  const [text, setText] = useState(toInput(value));
  useEffect(() => setText(toInput(value)), [value]);
  const commit = (s: string) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return setText(toInput(value));
    const t = snapLandingTime(parseUtc(`${s}:00Z`));
    setText(toInput(t));
    if (t !== value) onChange(t);
  };
  const step = (ms: number) => onChange(snapLandingTime(value + ms));
  return (
    <div className="picker">
      <label>
        Landing Time (UTC)
        <input
          type="datetime-local"
          step={STEP_S}
          min={toInput(SPAN_START)}
          max={toInput(SPAN_END - STEP_MS)}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
        />
      </label>
      <div className="steps">
        <button onClick={() => step(-DAY_MS)} title="One day earlier">−1 d</button>
        <button onClick={() => step(-HOUR_MS)} title="One hour earlier">−1 h</button>
        <button onClick={() => step(HOUR_MS)} title="One hour later">+1 h</button>
        <button onClick={() => step(DAY_MS)} title="One day later">+1 d</button>
      </div>
      <p className="fine">
        Supported Span: {formatUtc(SPAN_START).slice(0, 10)} to {formatUtc(SPAN_END).slice(0, 10)}. Surface Stay: {(STAY_STEPS * STEP_MS) / DAY_MS} days from the
        Landing Time.
      </p>
    </div>
  );
}
