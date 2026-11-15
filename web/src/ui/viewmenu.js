// SPDX-License-Identifier: MIT
// Hover menus over the 3D view (Shading, Slice around the site). Each menu mirrors a hidden <select>: hovering or
// focusing the button opens the list, picking an item sets the select and fires its "change" event, so the code that
// listens to the select (main.js) doesn't change.

/**
 * Turn every `.view-menu[data-for=<select id>]` inside `root` into a hover menu for that select.
 * The button shows the menu's name and the chosen option's short label (`data-short`, else its text).
 */
export function bindViewMenus(root) {
  for (const menu of root.querySelectorAll(".view-menu")) {
    const select = document.getElementById(menu.dataset.for);
    const btn = menu.querySelector(".view-menu-btn"), value = menu.querySelector(".view-menu-value"), list = menu.querySelector(".view-menu-list");
    const short = (o) => o.dataset.short || o.textContent;
    const open = (on) => { menu.classList.toggle("open", on); btn.setAttribute("aria-expanded", String(on)); };
    const render = () => {
      value.textContent = short(select.selectedOptions[0]);
      list.replaceChildren(...[...select.options].map((o) => {
        const li = document.createElement("li");
        const item = Object.assign(document.createElement("button"), { type: "button", className: "view-menu-item", textContent: o.textContent });
        item.setAttribute("role", "menuitemradio");
        item.setAttribute("aria-checked", String(o.selected));
        item.addEventListener("click", () => {
          if (select.value !== o.value) { select.value = o.value; select.dispatchEvent(new Event("change", { bubbles: true })); }
          render();
          open(false);
          btn.focus();
        });
        li.appendChild(item);
        return li;
      }));
    };
    render();
    menu.addEventListener("pointerenter", () => open(true));
    menu.addEventListener("pointerleave", () => open(false));
    btn.addEventListener("click", () => open(!menu.classList.contains("open")));
    menu.addEventListener("focusout", (e) => { if (!menu.contains(e.relatedTarget)) open(false); });
    menu.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { open(false); btn.focus(); }
      if (e.key === "ArrowDown" && !menu.classList.contains("open")) { e.preventDefault(); open(true); list.querySelector("button")?.focus(); }
    });
    select.addEventListener("change", render);
  }
}
