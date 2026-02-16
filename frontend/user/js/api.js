const API_BASE = "https://api.horse-id-system.ru/api";

// Базовый запрос без админ-токена
async function apiRequest(path, options = {}) {
  const opts = { ...options };
  opts.method = opts.method || "GET";
  opts.headers = opts.headers ? { ...opts.headers } : {};

  // Если передали обычный объект — шлём JSON
  if (opts.body && !(opts.body instanceof FormData)) {
    if (!opts.headers["Content-Type"]) {
      opts.headers["Content-Type"] = "application/json";
    }
    if (opts.headers["Content-Type"].includes("application/json")) {
      opts.body = JSON.stringify(opts.body);
    }
  }

  const res = await fetch(API_BASE + path, opts);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ошибка ${res.status}: ${text}`);
  }

  const ct = res.headers.get("Content-Type") || "";
  if (ct.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

// ---------- публичные функции для пользовательского фронта ----------

// Поиск заявок: пустой запрос → все заявки
export async function searchApplications(query = "") {
  const trimmed = (query || "").trim();
  const params = new URLSearchParams();

  if (trimmed !== "") {
    params.set("search", trimmed);
  }

  const qs = params.toString();
  return apiRequest("/applications" + (qs ? "?" + qs : ""));
}

// Получить одну заявку (для application.html)
export async function getApplication(id) {
  return apiRequest(`/applications/${encodeURIComponent(id)}`);
}

// Загрузка файла к заявке (права/ограничения проверяет сервер)
export async function uploadFile(applicationId, file, fileType, extra = {}) {
  const form = new FormData();
  form.append("file", file);
  form.append("file_type", fileType);
  if (extra && typeof extra === "object") {
    Object.entries(extra).forEach(([k, v]) => {
      if (v != null) form.append(k, String(v));
    });
  }
  return apiRequest(`/applications/${encodeURIComponent(applicationId)}/files`, {
    method: "POST",
    body: form,
  });
}

// Удаление файла пользователем (сервер сам решает, можно ли удалить)
export async function deleteFile(fileId) {
  return apiRequest(`/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
  });
}

// Для удобства index.js
export const api = {
  searchApplications,
  getApplication,
  uploadFile,
  deleteFile,
};
