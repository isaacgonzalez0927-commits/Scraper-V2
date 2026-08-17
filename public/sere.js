(function () {
  const palette = document.getElementById("search-palette");
  const input = document.getElementById("palette-input");
  const results = document.getElementById("palette-results");
  const sidebar = document.getElementById("sidebar");
  const scrim = document.querySelector("[data-close-nav]");
  const menuToggle = document.querySelector("[data-toggle-nav]");

  function lockPage(locked) {
    document.documentElement.classList.toggle("locked", locked);
    document.body.classList.toggle("locked", locked);
  }

  /* Search palette */

  function openPalette() {
    if (!palette) return;
    palette.classList.add("open");
    lockPage(true);
    if (input) {
      input.value = "";
      results.innerHTML = '<div class="palette-group">Type a name, invoice, phone, or address</div>';
      setTimeout(() => input.focus(), 40);
    }
  }

  function closePalette() {
    if (palette) palette.classList.remove("open");
    if (!sidebar || !sidebar.classList.contains("open")) lockPage(false);
  }

  document.querySelectorAll("[data-open-search]").forEach((el) => {
    el.addEventListener("click", openPalette);
  });
  document.querySelectorAll("[data-close-search]").forEach((el) => {
    el.addEventListener("click", closePalette);
  });

  if (palette) {
    palette.addEventListener("click", (e) => {
      if (e.target === palette) closePalette();
    });
  }

  let timer = null;
  if (input) {
    input.addEventListener("input", () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) return;
      timer = setTimeout(async () => {
        const res = await fetch("/api/search?q=" + encodeURIComponent(q), {
          headers: { "X-Requested-With": "fetch" },
        });
        const data = await res.json();
        const groups = [
          ["Customers", data.customers],
          ["Jobs", data.jobs],
          ["Invoices", data.invoices],
        ];
        let html = "";
        groups.forEach(([label, items]) => {
          if (!items || !items.length) return;
          html += '<div class="palette-group">' + label + "</div>";
          items.forEach((item) => {
            html +=
              '<a href="' + item.href + '"><strong>' + esc(item.label) + "</strong>" +
              '<div class="tiny">' + esc(item.meta || "") + "</div></a>";
          });
        });
        results.innerHTML = html || '<div class="palette-group">No matches</div>';
      }, 120);
    });
  }

  /* Mobile navigation drawer */

  function setNav(open) {
    if (!sidebar) return;
    sidebar.classList.toggle("open", open);
    if (scrim) scrim.classList.toggle("open", open);
    if (menuToggle) menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (menuToggle) menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    lockPage(open || Boolean(palette && palette.classList.contains("open")));
    if (!open) sidebar.style.transform = "";
  }

  document.querySelectorAll("[data-toggle-nav]").forEach((el) => {
    el.addEventListener("click", () => setNav(!sidebar.classList.contains("open")));
  });
  if (scrim) scrim.addEventListener("click", () => setNav(false));
  if (sidebar) {
    sidebar.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setNav(false));
    });
  }

  /* Swipe the drawer shut, the way an iPhone sheet works. */
  let touchStartX = 0;
  let dragging = false;
  if (sidebar) {
    sidebar.addEventListener("touchstart", (e) => {
      if (!sidebar.classList.contains("open")) return;
      touchStartX = e.touches[0].clientX;
      dragging = true;
      sidebar.style.transition = "none";
    }, { passive: true });
    sidebar.addEventListener("touchmove", (e) => {
      if (!dragging) return;
      const dx = Math.min(0, e.touches[0].clientX - touchStartX);
      sidebar.style.transform = "translateX(" + dx + "px)";
    }, { passive: true });
    sidebar.addEventListener("touchend", (e) => {
      if (!dragging) return;
      dragging = false;
      sidebar.style.transition = "";
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (dx < -56) setNav(false);
      else sidebar.style.transform = "";
    });
  }

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openPalette();
    }
    if (e.key === "Escape") {
      closePalette();
      setNav(false);
    }
  });

  /* Dependent selects */

  const customerSelect = document.getElementById("customer_id");
  const jobSelect = document.getElementById("job_id");
  if (customerSelect && jobSelect) {
    customerSelect.addEventListener("change", async () => {
      const id = customerSelect.value;
      if (!id) return;
      const res = await fetch("/api/jobs-for-customer/" + id);
      const jobs = await res.json();
      jobSelect.innerHTML =
        '<option value="">No related job</option>' +
        jobs.map((j) => '<option value="' + j.id + '">' + esc(j.title) + "</option>").join("");
    });
  }

  /* Invoice line items */

  const catalog = document.getElementById("service-catalog");
  if (catalog) {
    catalog.addEventListener("change", () => {
      const opt = catalog.selectedOptions[0];
      if (!opt || !opt.value) return;
      addLine(opt.dataset.name, opt.dataset.price);
      catalog.selectedIndex = 0;
    });
  }

  const addLineBtn = document.getElementById("add-line");
  if (addLineBtn) addLineBtn.addEventListener("click", () => addLine("", ""));

  document.querySelectorAll("[data-remove-line]").forEach((btn) => {
    btn.addEventListener("click", () => removeLine(btn));
  });

  function removeLine(btn) {
    const body = document.getElementById("line-body");
    const row = btn.closest("tr");
    if (!body || !row) return;
    if (body.rows.length > 1) row.remove();
    else row.querySelectorAll("input").forEach((el) => { el.value = el.name === "line_quantity" ? "1" : ""; });
  }

  function addLine(description, price) {
    const body = document.getElementById("line-body");
    if (!body) return;
    const row = document.createElement("tr");
    row.innerHTML =
      '<td><input name="line_description" value="' + esc(description) + '" required></td>' +
      '<td><input name="line_quantity" value="1" inputmode="decimal"></td>' +
      '<td><input name="line_price" value="' + esc(price) + '" inputmode="decimal"></td>' +
      '<td class="right"><button type="button" class="btn btn-ghost btn-sm" data-remove-line>Remove</button></td>';
    row.querySelector("[data-remove-line]").addEventListener("click", (e) => removeLine(e.currentTarget));
    body.appendChild(row);
    const first = row.querySelector("input");
    if (!description && first) first.focus();
  }

  /* Calendar drag and drop */

  document.querySelectorAll(".cal-event[data-job]").forEach((el) => {
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", el.dataset.job);
    });
  });

  document.querySelectorAll(".cal-day[data-date]").forEach((day) => {
    day.addEventListener("dragover", (e) => e.preventDefault());
    day.addEventListener("drop", (e) => {
      e.preventDefault();
      const job = e.dataTransfer.getData("text/plain");
      if (!job) return;
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/api/jobs/" + job + "/reschedule";
      const field = document.createElement("input");
      field.name = "scheduled_start";
      field.value = day.dataset.date + "T09:00";
      form.appendChild(field);
      document.body.appendChild(form);
      form.submit();
    });
  });

  /* Copy to clipboard */

  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const value = btn.dataset.copy || "";
      let copied = false;
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch (err) {
        copied = legacyCopy(value);
      }
      const original = btn.dataset.label || btn.textContent;
      btn.dataset.label = original;
      btn.textContent = copied ? "Copied" : "Press ctrl C";
      setTimeout(() => { btn.textContent = original; }, 1600);
    });
  });

  /* Clipboard API needs a focused, secure page. This works when it does not. */
  function legacyCopy(value) {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(field);
    return ok;
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
