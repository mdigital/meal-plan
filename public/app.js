// Progressive enhancement only: every page works without this file.
(() => {
  document.documentElement.classList.add("js");

  // Day builder: save a changed amount straight away.
  document.addEventListener("change", (e) => {
    const form = e.target.closest && e.target.closest("form[data-autosubmit]");
    if (form && e.target.matches("input")) form.requestSubmit();
  });
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }

  const num = (s) => {
    const n = parseFloat(String(s || "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  // Confirm destructive forms.
  document.addEventListener("submit", (e) => {
    const form = e.target;
    const msg = form.getAttribute("data-confirm");
    if (msg && !window.confirm(msg)) {
      e.preventDefault();
      return;
    }
    // Loading state: disable the submit button and show its busy label.
    const btn = e.submitter || form.querySelector("button[type=submit]");
    if (btn && btn.dataset.busy) {
      btn.dataset.label = btn.textContent;
      btn.textContent = btn.dataset.busy;
      setTimeout(() => btn.setAttribute("disabled", ""), 0);
    }
  });

  // Restore buttons when navigating back (bfcache).
  window.addEventListener("pageshow", () => {
    document.querySelectorAll("button[data-label]").forEach((b) => {
      b.textContent = b.dataset.label;
      b.removeAttribute("disabled");
    });
  });

  // Ingredient rows on the meal form.
  document.querySelectorAll("[data-meal-form]").forEach((form) => {
    const list = form.querySelector("[data-ing-list]");
    const tpl = form.querySelector("[data-ing-template]");
    form.addEventListener("click", (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      if (t.matches("[data-add-row]")) {
        const row = tpl.content.firstElementChild.cloneNode(true);
        const n = list.children.length + 1;
        row.querySelector("legend").textContent = `Ingredient ${n}`;
        row.querySelector("[data-remove-row]").setAttribute("aria-label", `Remove ingredient ${n}`);
        list.appendChild(row);
        row.querySelector("input").focus();
      } else if (t.matches("[data-remove-row]")) {
        const row = t.closest(".ing-row");
        if (list.children.length > 1) row.remove();
        else row.querySelectorAll("input").forEach((i) => (i.value = ""));
      } else if (t.matches("[data-calc-totals]")) {
        const servings = num(form.querySelector("[name=servings]").value) || 1;
        let k = 0, p = 0, f = 0, any = false;
        list.querySelectorAll(".ing-row").forEach((row) => {
          const get = (n) => row.querySelector(`[name=${n}]`).value;
          if (get("ing_kcal") || get("ing_protein") || get("ing_fibre")) any = true;
          k += num(get("ing_kcal"));
          p += num(get("ing_protein"));
          f += num(get("ing_fibre"));
        });
        const out = form.querySelector("[data-calc-result]");
        if (!any) {
          out.textContent = "Add kcal, protein or fibre to the ingredient lines first.";
          return;
        }
        const r = (x) => Math.round((x / servings) * 10) / 10;
        form.querySelector("[name=kcal]").value = Math.round(k / servings);
        form.querySelector("[name=protein]").value = r(p);
        form.querySelector("[name=fibre]").value = r(f);
        out.textContent = `Updated from ${servings} serve${servings === 1 ? "" : "s"}.`;
      }
    });
  });

  // Keep the selected filter chip visible in horizontally scrolling rows.
  document.querySelectorAll(".chips [aria-current]").forEach((chip) => {
    const row = chip.parentElement;
    if (chip.offsetLeft + chip.offsetWidth > row.clientWidth) row.scrollLeft = chip.offsetLeft - 16;
  });

  // Shopping list: tick items without reloading the page.
  document.addEventListener("submit", async (e) => {
    const form = e.target;
    if (!form.matches || !form.matches("form[data-toggle-item]")) return;
    e.preventDefault();
    const btn = form.querySelector(".check");
    const hidden = form.querySelector("[name=checked]");
    const next = hidden.value === "1";
    btn.setAttribute("aria-checked", String(next)); // optimistic
    try {
      const res = await fetch(form.action, {
        method: "POST",
        headers: { accept: "application/json", "x-csrf-token": form.querySelector("[name=_csrf]").value },
        body: new URLSearchParams(new FormData(form)),
      });
      if (!res.ok) throw new Error(String(res.status));
      hidden.value = next ? "0" : "1";
    } catch {
      btn.setAttribute("aria-checked", String(!next));
      return;
    }
    const all = document.querySelectorAll("form[data-toggle-item] .check");
    const done = document.querySelectorAll('form[data-toggle-item] .check[aria-checked="true"]');
    const p = document.querySelector("[data-progress]");
    if (p) p.textContent = `${done.length} of ${all.length} ticked.`;
  }, true);

  // Copy-to-clipboard buttons.
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    const src = document.getElementById(btn.getAttribute("data-copy"));
    const text = src.value ?? src.textContent;
    try {
      if (navigator.share && btn.hasAttribute("data-share")) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        const old = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(() => (btn.textContent = old), 1500);
      }
    } catch {
      src.select?.();
    }
  });
})();
