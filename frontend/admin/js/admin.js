const API_BASE = "https://api.horse-id-system.ru/api";
// Токен администратора — должен совпадать с ADMIN_TOKEN в .env бэкенда
const ADMIN_TOKEN = "secret123";

async function apiRequest(path, { method = "GET", body = null } = {}) {
  const headers = {};
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  // для списка заявок токен не обязателен, но можно отправлять — сервер его проигнорирует
  const res = await fetch(API_BASE + path, { method, headers, body });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const ct = res.headers.get("Content-Type") || "";
  if (ct.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchInput");
  const statusFilter = document.getElementById("statusFilter");
  const refreshButton = document.getElementById("refreshButton");
  const tbody = document.getElementById("appTableBody");
  const summary = document.getElementById("summary");
  const emptyState = document.getElementById("emptyState");

  async function loadApplications() {
    const search = searchInput.value.trim();
    let apps;
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const qs = params.toString();
      apps = await apiRequest("/applications" + (qs ? "?" + qs : ""));
    } catch (err) {
      console.error(err);
      alert("Ошибка загрузки заявок: " + err.message);
      return;
    }

    if (!Array.isArray(apps)) {
      console.error("Ожидался массив заявок, пришло:", apps);
      return;
    }

    // фильтр по статусу (по месту)
    const filter = statusFilter.value;
    if (filter) {
      apps = apps.filter((a) => (a.status || "").trim() === filter);
    }

    tbody.innerHTML = "";

    if (apps.length === 0) {
      emptyState.classList.remove("hidden");
      summary.textContent = "";
      return;
    } else {
      emptyState.classList.add("hidden");
    }

    summary.textContent = `Показано: ${apps.length}`;

    apps.forEach((app) => {
      const tr = document.createElement("tr");
      tr.className =
        "cursor-pointer hover:bg-slate-50 transition-colors text-sm";

      const name =
        (app.horse_name_ru || "").trim() ||
        (app.horse_name_en || "").trim() ||
        "Без клички";
      const year = app.horse_year ? String(app.horse_year) : "—";
      const status = app.status || "draft";
      const createdAt = app.created_at || "";

      tr.innerHTML = `
        <td class="px-3 py-2">
          <div class="font-medium">${escapeHtml(name)}</div>
          <div class="text-xs text-slate-500 break-all">${escapeHtml(
            app.id
          )}</div>
        </td>
        <td class="px-3 py-2">${escapeHtml(year)}</td>
        <td class="px-3 py-2">${escapeHtml(status)}</td>
        <td class="px-3 py-2 text-xs text-slate-500">${escapeHtml(
          createdAt || ""
        )}</td>
      `;

      tr.addEventListener("click", () => {
        window.location.href = `admin_view.html?id=${encodeURIComponent(
          app.id
        )}`;
      });

      tbody.appendChild(tr);
    });
  }

  refreshButton.addEventListener("click", () => loadApplications());
  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") loadApplications();
  });
  statusFilter.addEventListener("change", () => loadApplications());

  loadApplications();
});

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
