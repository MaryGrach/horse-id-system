const API_BASE = "https://horse-id-system-1.onrender.com/api";
const MAX_BYTES = 200 * 1024 * 1024; // 200 MB
const FORBIDDEN_EXT = /\.(exe|bat|cmd|sh|js|jar|py)$/i;

// --- элементы ---
const params = new URLSearchParams(window.location.search);
let appId = params.get("id") || "new";
const isNew = () => appId === "new";
let currentStatus = "draft";

const el = {
  horseNameRu: document.getElementById("horseNameRu"),
  horseNameEn: document.getElementById("horseNameEn"),
  horseYear: document.getElementById("horseYear"),
  status: document.getElementById("applicationStatus"),
  submitButton: document.getElementById("submitButton"),
  backButton: document.getElementById("backButton"),
  

  // file inputs
  file_passport_application: document.getElementById("file_passport_application"),
  file_ownership_or_contract: document.getElementById("file_ownership_or_contract"),
  file_breeding_or_certificate: document.getElementById("file_breeding_or_certificate"),
  file_foal_identification_act: document.getElementById("file_foal_identification_act"),
  file_genetic_certificate: document.getElementById("file_genetic_certificate"),
  file_media: document.getElementById("file_media"),

  // lists
  list_passport_application: document.getElementById("list_passport_application"),
  list_ownership_or_contract: document.getElementById("list_ownership_or_contract"),
  list_breeding_or_certificate: document.getElementById("list_breeding_or_certificate"),
  list_foal_identification_act: document.getElementById("list_foal_identification_act"),
  list_genetic_certificate: document.getElementById("list_genetic_certificate"),
  list_media: document.getElementById("list_media"),

  selectOwnership: document.getElementById("select_ownership"),
  selectBreeding: document.getElementById("select_breeding"),

};

// mapping input id -> file_type (server)
const FILE_TYPE_MAP = {
  file_passport_application: "passport_application",
  file_ownership_or_contract: "ownership_or_contract",
  file_breeding_or_certificate: "breeding_or_certificate",
  file_foal_identification_act: "foal_identification_act",
  file_genetic_certificate: "genetic_certificate",
  file_media: "media",
};
const SINGLE_FILE_TYPES = new Set([
  "passport_application",
  "breeding_or_certificate",
  "foal_identification_act",
  "genetic_certificate",
]);

// состояние заявки на фронте
let appStatus = "draft";
let filesCache = [];

// --- init ---
function init() {
  // back button
  el.backButton?.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // input listeners
  attachFileListener(el.file_passport_application);
  attachFileListener(el.file_ownership_or_contract);
  attachFileListener(el.file_breeding_or_certificate);
  attachFileListener(el.file_foal_identification_act);
  attachFileListener(el.file_genetic_certificate);
  attachFileListener(el.file_media);

  // submit
  el.submitButton.addEventListener("click", onSubmit);
  if (el.selectOwnership) {
    el.selectOwnership.addEventListener("change", saveSelectState);
  }
  if (el.selectBreeding) {
    el.selectBreeding.addEventListener("change", saveSelectState);
  }
  
  // form changes affect submit button state
  [el.horseNameRu, el.horseNameEn, el.horseYear].forEach(i => {
    if (!i) return;
    i.addEventListener("input", updateSubmitState);
  });

  // load existing app if not new
  if (!isNew()) {
    loadApplication();
  } else {
    updateSubmitState();
  }
}

function hasNonRejectedOfType(fileType) {
  return filesCache.some(
    (f) => f.file_type === fileType && f.status && f.status !== "rejected"
  );
}

function attachFileListener(inputEl) {
  if (!inputEl) return;
  inputEl.addEventListener("change", async () => {
    const files = Array.from(inputEl.files || []);
    if (!files.length) return;

    const fileType = FILE_TYPE_MAP[inputEl.id];
    if (!fileType) {
      inputEl.value = "";
      return;
    }

    // заявка complete — ничего добавить нельзя
    if (appStatus === "complete") {
      alert("Заявка принята, добавлять файлы нельзя.");
      inputEl.value = "";
      return;
    }

    // тип с ограничением в 1 файл (кроме отклонённых)
    if (SINGLE_FILE_TYPES.has(fileType) && hasNonRejectedOfType(fileType)) {
      alert(
        "Для этого документа уже есть загруженный файл (не отклонённый администратором)."
      );
      inputEl.value = "";
      return;
    }

    try {
      await ensureAppExists(); // создаём заявку при первой загрузке
    } catch (err) {
      alert("Не удалось создать заявку: " + err.message);
      inputEl.value = "";
      return;
    }

    for (const f of files) {
      const ok = validateFileClient(f);
      if (!ok) {
        inputEl.value = "";
        return;
      }

      const extra = {};
      if (inputEl.id === "file_ownership_or_contract" && el.selectOwnership) {
        extra.choice = el.selectOwnership.value;
      }
      if (inputEl.id === "file_breeding_or_certificate" && el.selectBreeding) {
        extra.choice = el.selectBreeding.value;
      }      

      try {
        await uploadFile(appId, f, fileType, extra);
      } catch (err) {
        alert("Ошибка загрузки: " + err.message);
      }
    }

    inputEl.value = "";
    await refreshFiles();
  });
}


function validateFileClient(file) {
  if (FORBIDDEN_EXT.test(file.name)) {
    alert("Запрещённое расширение: " + file.name);
    return false;
  }
  if (file.size > MAX_BYTES) {
    alert("Файл слишком большой (макс 200 MB): " + file.name);
    return false;
  }
  return true;
}


async function ensureAppExists() {
  // если заявка уже создана — ничего не делаем
  if (!isNew()) return;

  const ru = el.horseNameRu?.value?.trim();
  const en = el.horseNameEn?.value?.trim();
  const year = parseInt(el.horseYear?.value, 10);

  // та же логика, что для отправки:
  if ((!ru && !en) || !year || year < 1990 || year > new Date().getFullYear()) {
    throw new Error("Сначала заполните кличку (ru или en) и год (1990–текущий).");
  }

  const payload = {
    horse_name_ru: ru || null,
    horse_name_en: en || null,
    horse_year: year,
    notes: ""
  };

  const res = await fetch(`${API_BASE}/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error("Ошибка создания заявки: " + msg);
  }

  const app = await res.json();

  // сохраняем id и обновляем URL
  appId = app.id;
  history.replaceState(null, "", `?id=${encodeURIComponent(appId)}`);
}


async function uploadFile(applicationId, file, fileType, extra = {}) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("file_type", fileType);
  // include extra meta if present
  if (extra.choice) fd.append("choice", extra.choice);

  const res = await fetch(`${API_BASE}/applications/${applicationId}/files`, {
    method: "POST",
    body: fd
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `Upload failed (${res.status})`);
  }
  return true;
}

async function refreshFiles() {
  if (isNew()) return;
  try {
    const data = await apiGetApplication(appId);
    const app = data.application;
    appStatus = app?.status || "draft";
    filesCache = data.files || [];

    el.status.textContent = "статус: " + (appStatus || "—");

    renderFiles(filesCache);
    updateFormLocking(app, filesCache);
    updateSubmitState();
  } catch (err) {
    console.error("refreshFiles err", err);
  }
}

async function apiGetApplication(id) {
  const res = await fetch(`${API_BASE}/applications/${id}`);
  if (!res.ok) throw new Error("Не удалось загрузить заявку");
  return res.json();
}

// delete file
async function deleteFile(fileId) {
  if (!confirm("Удалить файл?")) return;
  const res = await fetch(`${API_BASE}/files/${fileId}`, { method: "DELETE" });
  if (res.status === 401) {
    alert("Нельзя удалить файл: требуется авторизация администратора.");
    return;
  }
  if (!res.ok) {
    alert("Ошибка удаления файла: " + (await res.text()));
    return;
  }
  await refreshFiles();
}

// submit application (send)
async function onSubmit() {
  // validate
  const ru = el.horseNameRu?.value?.trim();
  const en = el.horseNameEn?.value?.trim();
  const year = parseInt(el.horseYear?.value);

  if ((!ru && !en) || !year || year < 1990 || year > new Date().getFullYear()) {
    alert("Заполните корректно кличку (ru или en) и год (1990–текущий).");
    return;
  }

  try {
    // if new and not created yet, create first
    if (isNew()) {
      await ensureAppExists();
    } else {
      // try to PATCH application (if server allows)
      try {
        await fetch(`${API_BASE}/applications/${appId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ horse_name_ru: ru || null, horse_name_en: en || null, horse_year: year })
        }).then(async (r) => {
          if (!r.ok) {
            // not fatal — warn
            console.warn("PATCH failed:", r.status);
            // optionally show message to user:
            const txt = await r.text();
            if (r.status !== 404 && r.status !== 401) alert("Warning: " + txt);
          }
        });
      } catch (err) {
        console.warn("PATCH exception", err);
      }
    }
    if (el.selectOwnership) {
      localStorage.setItem(`ownership_select_${appId}`, el.selectOwnership.value);
    }
    if (el.selectBreeding) {
      localStorage.setItem(`breeding_select_${appId}`, el.selectBreeding.value);
    }
    saveSelectState();
    // finally call submit endpoint
    const res = await fetch(`${API_BASE}/applications/${appId}/submit`, { method: "POST" });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || "Submit failed");
    }

    alert("Заявка успешно отправлена");
    window.location.href = "index.html";

  } catch (err) {
    alert("Ошибка: " + err.message);
  }
}

function renderFiles(files) {
  filesCache = files || [];

  // clear
  el.list_passport_application.innerHTML = "";
  el.list_ownership_or_contract.innerHTML = "";
  el.list_breeding_or_certificate.innerHTML = "";
  el.list_foal_identification_act.innerHTML = "";
  el.list_genetic_certificate.innerHTML = "";
  el.list_media.innerHTML = "";

  filesCache.forEach((f) => {
    const elBlock = getListContainerByType(f.file_type);
    if (!elBlock) return;
    const row = document.createElement("div");
    row.className = "flex items-center justify-between py-1.5";

    const left = document.createElement("div");
    left.innerHTML = `<div class="text-sm font-medium">${escapeHtml(
      f.original_name
    )}</div>
                      <div class="text-xs text-gray-500">${formatBytes(
                        f.size_bytes
                      )} · ${f.status}</div>`;

    const right = document.createElement("div");
    // пользователь может удалять только draft-файлы и только в draft-заявке
    const canDelete =
      appStatus === "draft" && (!f.status || f.status === "draft");

    if (canDelete) {
      const del = document.createElement("button");
      del.className = "ml-3 text-sm text-red-600";
      del.textContent = "Удалить";
      del.addEventListener("click", () => deleteFile(f.id));
      right.appendChild(del);
    } else {
      const span = document.createElement("span");
      span.className = "text-sm text-gray-500";
      span.textContent = "";
      right.appendChild(span);
    }

    row.appendChild(left);
    row.appendChild(right);
    elBlock.appendChild(row);
  });
}

function getListContainerByType(fileType) {
  switch (fileType) {
    case "passport_application": return el.list_passport_application;
    case "ownership_or_contract": return el.list_ownership_or_contract;
    case "breeding_or_certificate": return el.list_breeding_or_certificate;
    case "foal_identification_act": return el.list_foal_identification_act;
    case "genetic_certificate": return el.list_genetic_certificate;
    case "media": return el.list_media;
    default: return null;
  }
}

// --- helpers ---
function escapeHtml(s) {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const sizes = ["B","KB","MB","GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i?1:0) + " " + sizes[i];
}
function saveSelectState() {
  if (!appId || appId === "new") return;

  if (el.selectOwnership) {
    localStorage.setItem(
      `ownership_select_${appId}`,
      el.selectOwnership.value
    );
  }
  if (el.selectBreeding) {
    localStorage.setItem(
      `breeding_select_${appId}`,
      el.selectBreeding.value
    );
  }
}

function restoreSelectState() {
  if (!appId || appId === "new") return;

  if (el.selectOwnership) {
    const v = localStorage.getItem(`ownership_select_${appId}`);
    if (v) el.selectOwnership.value = v;
  }
  if (el.selectBreeding) {
    const v = localStorage.getItem(`breeding_select_${appId}`);
    if (v) el.selectBreeding.value = v;
  }
}

function updateFormLocking(app, files) {
  if (!app) return;

  const hasNonDraftFiles = (files || []).some(
    (f) => f.status && f.status !== "draft"
  );
  const isComplete = app.status === "complete";
  const lockNamesAndYear = hasNonDraftFiles || isComplete;

  // имена и год можно менять только пока нет sent/accepted/rejected
  if (el.horseNameRu) el.horseNameRu.disabled = lockNamesAndYear;
  if (el.horseNameEn) el.horseNameEn.disabled = lockNamesAndYear;
  if (el.horseYear) el.horseYear.disabled = lockNamesAndYear;

  // загрузка файлов — запрещена только при complete
  const disableFileInputs = isComplete;
  [
    el.file_passport_application,
    el.file_ownership_or_contract,
    el.file_breeding_or_certificate,
    el.file_foal_identification_act,
    el.file_genetic_certificate,
    el.file_media,
  ].forEach((inp) => {
    if (!inp) return;
    inp.disabled = disableFileInputs;
  });
}

function updateSubmitState() {
  const ru = el.horseNameRu?.value?.trim();
  const en = el.horseNameEn?.value?.trim();
  const year = parseInt(el.horseYear?.value);
  const validYear =
    !isNaN(year) && year >= 1990 && year <= new Date().getFullYear();

  let disabled = !((ru || en) && validYear);

  // заявку complete уже нельзя отправлять ещё раз
  if (appStatus === "complete") {
    disabled = true;
  }

  el.submitButton.disabled = disabled;
  el.submitButton.classList.toggle("opacity-50", disabled);
}

async function loadApplication() {
  try {
    const data = await apiGetApplication(appId);
    const app = data.application;
    if (!app) return;

    appStatus = app.status || "draft";
    filesCache = data.files || [];

    if (app.horse_name_ru) el.horseNameRu.value = app.horse_name_ru;
    else el.horseNameRu.value = "";
    if (app.horse_name_en) el.horseNameEn.value = app.horse_name_en;
    else el.horseNameEn.value = "";
    if (app.horse_year) el.horseYear.value = app.horse_year;
    else el.horseYear.value = "";

    el.status.textContent = "статус: " + (appStatus || "—");

    renderFiles(filesCache);
    updateFormLocking(app, filesCache);
    updateSubmitState();
    restoreSelectState();

  } catch (err) {
    console.error("loadApplication err", err);
    alert("Не удалось загрузить заявку: " + err.message);
  }
}

init();
