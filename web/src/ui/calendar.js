// SPDX-License-Identifier: MIT
// The Landing Time calendar, shared by the region map's Landing Time picker and the site view's Date field.
// Three views like a desktop clock: days of a month, the months of a year, or the years. Clicking the title goes up a
// level; picking a month or year goes back down. Days outside the Supported Span can't be picked. No-Full-Stay Days
// are black and crossed out but can still be picked. The chosen Surface Stay is lit up: the landing day in amber
// ("LAND"), days 2–7 as one teal band across rows.

import { SPAN_START, SPAN_END, DAY_MS } from "./ranking.js";

/** Markup for an empty calendar; `new Calendar(root)` fills the `.cal` inside `root`. */
export const calendarHtml = (label = "Landing date") => `
  <div class="cal" role="group" aria-label="${label}">
    <div class="cal-head">
      <button type="button" class="cal-nav" data-dir="-1">‹</button>
      <button type="button" class="cal-title" aria-live="polite"></button>
      <button type="button" class="cal-nav" data-dir="1">›</button>
    </div>
    <div class="cal-grid"></div>
  </div>`;

const dayOf = (ms) => ms - (((ms % DAY_MS) + DAY_MS) % DAY_MS);

export class Calendar {
  /**
   * @param {Element} root holds the calendarHtml() markup
   * @param {{ onPick: (dayMs: number) => void }} opts called with the UTC start of the picked day
   */
  constructor(root, { onPick }) {
    this.root = root;
    this.onPick = onPick;
    this.chosen = null;  // Landing Time (ms) or null
    this.noStay = null;  // Set of UTC day starts with no full 7-day window, or null
    this.view = "days";
    this.month = Date.UTC(new Date(SPAN_START).getUTCFullYear(), new Date(SPAN_START).getUTCMonth(), 1);
    root.querySelector(".cal-title").addEventListener("click", () => {
      this.view = this.view === "days" ? "months" : "years";
      this.draw();
    });
    for (const b of root.querySelectorAll(".cal-nav")) b.addEventListener("click", () => {
      const d = new Date(this.month), k = Number(b.dataset.dir);
      this.month = this.view === "days" ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1) : Date.UTC(d.getUTCFullYear() + k, d.getUTCMonth(), 1);
      this.draw();
    });
  }
  /** Show the month of `ms` (in the days view). */
  showMonthOf(ms) {
    const t = new Date(ms);
    this.month = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1);
    this.view = "days";
  }
  /** Mark `ms` as the Landing Time (null: none) and redraw; jumps to its month when it is in another one. */
  setChosen(ms) {
    this.chosen = ms;
    if (ms !== null && (this.view !== "days" || dayOf(ms) < this.month || dayOf(ms) >= Date.UTC(new Date(this.month).getUTCFullYear(), new Date(this.month).getUTCMonth() + 1, 1))) this.showMonthOf(ms);
    this.draw();
  }
  draw() {
    const root = this.root, gridEl = root.querySelector(".cal-grid");
    const m = new Date(this.month), y = m.getUTCFullYear(), mo = m.getUTCMonth();
    const s0 = new Date(SPAN_START), s1 = new Date(SPAN_END - 1);
    const firstMonth = Date.UTC(s0.getUTCFullYear(), s0.getUTCMonth(), 1), lastMonth = Date.UTC(s1.getUTCFullYear(), s1.getUTCMonth(), 1);
    const fmt = (ms, o) => new Date(ms).toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
    const chosen = this.chosen === null ? null : new Date(this.chosen);
    const chosenDay = chosen && dayOf(this.chosen);
    const title = root.querySelector(".cal-title"), [prev, next] = root.querySelectorAll(".cal-nav");
    gridEl.className = `cal-grid view-${this.view}`;
    let html = "";
    if (this.view === "days") {
      title.textContent = fmt(this.month, { month: "long", year: "numeric" });
      title.title = "Show the months";
      prev.disabled = this.month <= firstMonth;
      next.disabled = this.month >= lastMonth;
      prev.ariaLabel = "Previous month"; next.ariaLabel = "Next month";
      const lead = (m.getUTCDay() + 6) % 7, nDays = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      html = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => `<span class="cal-dow">${d}</span>`).join("") + "<span></span>".repeat(lead);
      for (let d = 1; d <= nDays; d++) {
        const day = Date.UTC(y, mo, d), out = day < SPAN_START || day >= SPAN_END, sel = day === chosenDay;
        const n = chosen ? Math.round((day - chosenDay) / DAY_MS) + 1 : 0, stay = n >= 2 && n <= 7; // day n of the stay
        // A No-Full-Stay Day is about starting a stay there, so days 2–7 of the chosen stay aren't crossed out:
        // inside the band it read as "a bad day in my stay".
        const nostay = !out && !stay && !!this.noStay?.has(day);
        const col = (lead + d - 1) % 7;
        const cls = ["cal-day", nostay && "nostay", sel && "sel", stay && "stay",
          (sel || stay) && (n === 7 || col === 6 || d === nDays) && "band-end", stay && col === 0 && "band-start"].filter(Boolean).join(" ");
        const why = out ? "Outside the supported year"
          : [sel && "Landing day", stay && `Day ${n} of the stay`, nostay && "No site in the region has a full 7-day window starting this day"].filter(Boolean).join(". ");
        const label = fmt(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        html += `<button type="button" class="${cls}" data-day="${day}"${stay ? ` data-n="${n}"` : ""}${out ? " disabled" : ""}`
          + ` aria-label="${label}${why ? `, ${why}` : ""}" title="${why || label}" aria-pressed="${sel}">${d}</button>`;
      }
    } else if (this.view === "months") {
      title.textContent = String(y);
      title.title = "Show the years";
      prev.disabled = y <= s0.getUTCFullYear();
      next.disabled = y >= s1.getUTCFullYear();
      prev.ariaLabel = "Previous year"; next.ariaLabel = "Next year";
      for (let k = 0; k < 12; k++) {
        const ms = Date.UTC(y, k, 1), out = ms < firstMonth || ms > lastMonth;
        const sel = chosen && chosen.getUTCFullYear() === y && chosen.getUTCMonth() === k;
        html += `<button type="button" class="cal-cell${sel ? " sel" : ""}${ms === this.month ? " here" : ""}" data-month="${ms}"${out ? " disabled" : ""}`
          + ` aria-label="${fmt(ms, { month: "long", year: "numeric" })}${out ? ", outside the supported year" : ""}">${fmt(ms, { month: "short" })}</button>`;
      }
    } else {
      const y0 = s0.getUTCFullYear(), y1 = s1.getUTCFullYear();
      title.textContent = `${y0} – ${y1}`;
      title.title = "";
      prev.disabled = next.disabled = true;
      prev.ariaLabel = "Previous years"; next.ariaLabel = "Next years";
      for (let yy = y0; yy <= y1; yy++) {
        const sel = chosen && chosen.getUTCFullYear() === yy;
        html += `<button type="button" class="cal-cell${sel ? " sel" : ""}${yy === y ? " here" : ""}" data-year="${yy}">${yy}</button>`;
      }
    }
    title.disabled = this.view === "years";
    gridEl.innerHTML = html;
    for (const b of gridEl.querySelectorAll(".cal-day:not([disabled])")) b.addEventListener("click", () => this.onPick(Number(b.dataset.day)));
    for (const b of gridEl.querySelectorAll("[data-month]:not([disabled])")) b.addEventListener("click", () => { this.month = Number(b.dataset.month); this.view = "days"; this.draw(); });
    for (const b of gridEl.querySelectorAll("[data-year]")) b.addEventListener("click", () => {
      // keep the month if it is in that year's part of the span, else the nearest month that is
      const ms = Date.UTC(Number(b.dataset.year), mo, 1);
      this.month = Math.min(lastMonth, Math.max(firstMonth, ms));
      this.view = "months";
      this.draw();
    });
  }
}
