const API_BASE = "http://localhost:8080/api";
const ADMIN_TOKEN = "secret123"; // локальная разработка

async function apiRequest(path, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers["X-ADMIN-TOKEN"] = ADMIN_TOKEN;

    const response = await fetch(API_BASE + path, options);

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Ошибка ${response.status}: ${text}`);
    }

    const type = response.headers.get("Content-Type") || "";
    if (type.includes("application/json")) {
        return response.json();
    }

    return null;
}

export async function getApplication(id) {
    return apiRequest(`/applications/${id}`);
}

export async function getApplications(query = "") {
    if (query) {
        return apiRequest(`/applications?q=${encodeURIComponent(query)}`);
    }
    return apiRequest("/applications");
}

export async function adminUpdateFileStatus(id, status) {
    return apiRequest(`/files/${id}?status=${status}`, {
        method: "PATCH"
    });
}

export async function adminDeleteFile(id) {
    return apiRequest(`/files/${id}`, {
        method: "DELETE"
    });
}

export async function adminUpdateApplication(id, status) {
    return apiRequest(`/applications/${id}?status=${status}`, {
        method: "PATCH"
    });
}
