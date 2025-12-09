import { api } from "./api.js";

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("searchInput");
  const button = document.getElementById("searchButton");
  const list = document.getElementById("resultsContainer");
  const createButton = document.getElementById("createButton");

  button.addEventListener("click", () => {
    const q = input.value.trim();
    loadApplications(q);
  });
  createButton.addEventListener("click", () => {
    window.location.href = "application.html?id=new";
  });
  // поиск по Enter
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const q = input.value.trim();
      loadApplications(q);
    }
  });

  // загрузить все заявки при открытии страницы
  loadApplications("");
});

async function loadApplications(query) {
  let apps;

  try {
    apps = await api.searchApplications(query);
  } catch (err) {
    console.error("Ошибка загрузки:", err);
    alert("Не удалось загрузить список заявок");
    return;
  }

  if (!Array.isArray(apps)) {
    console.error("Ожидался массив заявок, пришло:", apps);
    return;
  }

  const list = document.getElementById("resultsContainer");
  list.innerHTML = "";

  if (apps.length === 0) {
    const empty = document.createElement("div");
    empty.className = "text-gray-500 text-sm";
    empty.textContent = "Заявки не найдены";
    list.appendChild(empty);
    return;
  }

  apps.forEach((app) => {
    list.appendChild(createApplicationCard(app));
  });
}

function createApplicationCard(app) {
  const nameRu = app.horse_name_ru || "";
  const nameEn = app.horse_name_en || "";
  let displayName = "Без клички";
  if (nameRu && nameEn) displayName = `${nameRu} / ${nameEn}`;
  else if (nameRu) displayName = nameRu;
  else if (nameEn) displayName = nameEn;

  const yearText = app.horse_year ? `${app.horse_year}` : "";


  const div = document.createElement("div");
  div.className =
    "bg-white shadow-sm rounded-lg p-4 mb-3 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition";

  div.innerHTML = `
    <div>
      <div class="text-lg font-semibold">${escapeHtml(displayName)}</div>
      <div class="text-gray-500">${yearText}</div>
      
    </div>
    <div class="text-right">
      <div class="text-sm text-gray-600">Статус:</div>
      <div class="font-medium">${app.status || "draft"}</div>
    </div>
  `;

  div.addEventListener("click", () => {
    window.location.href = `application.html?id=${encodeURIComponent(app.id)}`;
  });

  return div;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
