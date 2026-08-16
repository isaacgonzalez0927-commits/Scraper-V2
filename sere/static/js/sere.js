(function () {
  const palette = document.getElementById("search-palette");
  const input = document.getElementById("palette-input");
  const results = document.getElementById("palette-results");
  const openers = document.querySelectorAll("[data-open-search]");
  const sidebar = document.querySelector(".sidebar");
  const menuBtn = document.querySelector("[data-toggle-nav]");

  function openPalette() {
    if (!palette) return;
    palette.classList.add("open");
    input.value = "";
    results.innerHTML = '<div class="palette-group">Type a name, invoice, phone, or address</div>';
    setTimeout(() => input.focus(), 20);
  }
  function closePalette() {
    if (!palette) return;
    palette.classList.remove("open");
  }

  openers.forEach((el) => el.addEventListener("click", openPalette));
  palette && palette.addEventListener("click", (e) => {
    if (e.target === palette) closePalette();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openPalette();
    }
    if (e.key === "Escape") closePalette();
  });

  let timer = null;
  input && input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return;
    timer = setTimeout(async () => {
      const res = await fetch("/search?json=1&q=" + encodeURIComponent(q), {
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
        if (!items.length) return;
        html += `<div class="palette-group">${label}</div>`;
        items.forEach((item) => {
          html += `<a href="${item.href}"><strong>${esc(item.label)}</strong><div class="tiny">${esc(item.meta || "")}</div></a>`;
        });
      });
      results.innerHTML = html || '<div class="palette-group">No matches</div>';
    }, 120);
  });

  menuBtn && menuBtn.addEventListener("click", () => {
    sidebar && sidebar.classList.toggle("open");
  });

  const customerSelect = document.getElementById("customer_id");
  const jobSelect = document.getElementById("job_id");
  if (customerSelect && jobSelect) {
    customerSelect.addEventListener("change", async () => {
      const id = customerSelect.value;
      if (!id) return;
      const res = await fetch("/api/jobs-for-customer/" + id);
      const jobs = await res.json();
      jobSelect.innerHTML = '<option value="">No related job</option>' +
        jobs.map((j) => `<option value="${j.id}">${esc(j.title)}</option>`).join("");
    });
  }

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
  addLineBtn && addLineBtn.addEventListener("click", () => addLine("", ""));

  document.querySelectorAll("[data-remove-line]").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest("tr").remove());
  });

  function addLine(description, price) {
    const body = document.getElementById("line-body");
    if (!body) return;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><input name="line_description" value="${esc(description)}" required></td>
      <td><input name="line_quantity" value="1" inputmode="decimal"></td>
      <td><input name="line_price" value="${esc(price)}" inputmode="decimal"></td>
      <td><button type="button" class="btn btn-ghost btn-sm" data-remove-line>Remove</button></td>`;
    row.querySelector("[data-remove-line]").addEventListener("click", () => row.remove());
    body.appendChild(row);
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
})();
