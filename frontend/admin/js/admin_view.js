const API_BASE = "https://api.horse-id-system.ru/api";
const ADMIN_TOKEN = "secret123"; // должен совпадать с ADMIN_TOKEN на бэкенде

async function apiRequest(path, { method = "GET", body = null, admin = false } = {}) {
  const headers = {};
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  if (admin) {
    headers["X-ADMIN-TOKEN"] = ADMIN_TOKEN;
  }
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
  const params = new URLSearchParams(window.location.search);
  const appId = params.get("id");

  const elAppId = document.getElementById("appId");
  const elHorseRu = document.getElementById("horseNameRu");
  const elHorseEn = document.getElementById("horseNameEn");
  const elYear = document.getElementById("horseYear");
  const elStatus = document.getElementById("appStatus");
  const elFiles = document.getElementById("filesContainer");
  const elFilesEmpty = document.getElementById("filesEmpty");
  const btnBack = document.getElementById("backButton");
  const btnComplete = document.getElementById("markCompleteBtn");

  if (!appId) {
    alert("Не указан id заявки");
    return;
  }
  elAppId.textContent = appId;

  btnBack.addEventListener("click", () => {
    window.location.href = "admin.html";
  });

  btnComplete.addEventListener("click", async () => {
    if (!confirm("Пометить заявку как complete?")) return;
    try {
      await apiRequest(`/applications/${encodeURIComponent(appId)}?status=complete`, {
        method: "PATCH",
        admin: true,
      });
      await load();
    } catch (err) {
      alert("Ошибка обновления заявки: " + err.message);
    }
  });

  async function load() {
    let data;
    try {
      data = await apiRequest(`/applications/${encodeURIComponent(appId)}`);
    } catch (err) {
      console.error(err);
      alert("Не удалось загрузить заявку: " + err.message);
      return;
    }

    const app = data.application || {};
    const files = Array.isArray(data.files) ? data.files : [];

    elHorseRu.textContent = app.horse_name_ru || "—";
    elHorseEn.textContent = app.horse_name_en || "—";
    elYear.textContent = app.horse_year || "—";
    elStatus.textContent = app.status || "draft";

    renderFiles(files);
  }

  function renderFiles(files) {
    elFiles.innerHTML = "";

    // админ не видит draft-файлы: фильтруем
    const visible = files.filter((f) => f.status && f.status !== "draft");

    if (visible.length === 0) {
      elFilesEmpty.classList.remove("hidden");
      return;
    } else {
      elFilesEmpty.classList.add("hidden");
    }

    visible.forEach((f) => {
      const row = document.createElement("div");
      row.className =
        "flex items-center justify-between border rounded-lg px-3 py-2";

      const left = document.createElement("div");
      left.innerHTML = `
        <div class="text-sm font-medium">${escapeHtml(f.original_name)}</div>
        <div class="text-xs text-slate-500">
          ${escapeHtml(f.file_type)} · ${escapeHtml(f.status)}
        </div>
      `;

      const right = document.createElement("div");
      right.className = "flex items-center gap-2";

      if (f.status === "sent") {
        const btnAccept = document.createElement("button");
        btnAccept.className =
          "px-2 py-1 rounded-lg bg-emerald-600 text-white text-xs";
        btnAccept.textContent = "Принять";
        btnAccept.addEventListener("click", () =>
          changeFileStatus(f.id, "accepted")
        );

        const btnReject = document.createElement("button");
        btnReject.className =
          "px-2 py-1 rounded-lg bg-red-600 text-white text-xs";
        btnReject.textContent = "Отклонить";
        btnReject.addEventListener("click", () =>
          changeFileStatus(f.id, "rejected")
        );

        right.appendChild(btnAccept);
        right.appendChild(btnReject);
      } else {
        const label = document.createElement("span");
        label.className = "text-xs px-2 py-1 rounded-full bg-slate-100";
        label.textContent = f.status;
        right.appendChild(label);
      }

      row.appendChild(left);
      row.appendChild(right);
      elFiles.appendChild(row);
    });
  }

  async function changeFileStatus(fileId, status) {
    try {
      await apiRequest(`/files/${encodeURIComponent(fileId)}?status=${encodeURIComponent(status)}`, {
        method: "PATCH",
        admin: true,
      });
      await load();
    } catch (err) {
      alert("Ошибка изменения статуса файла: " + err.message);
    }
  }

  load();
});

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
