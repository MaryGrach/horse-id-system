package main

import (
	"net/http"

	"github.com/gorilla/mux"
)

func SetupRoutes() *mux.Router {
	r := mux.NewRouter()

	// навешиваем CORS на все маршруты
	r.Use(EnableCORS)

	// публичные эндпоинты пользователя
	r.HandleFunc("/api/applications", CreateApplication).Methods("POST", "OPTIONS")
	r.HandleFunc("/api/applications", SearchApplications).Methods("GET", "OPTIONS")
	r.HandleFunc("/api/applications/{id}", GetApplication).Methods("GET", "OPTIONS")
	r.HandleFunc("/api/applications/{id}/files", UploadFile).Methods("POST", "OPTIONS")
	r.HandleFunc("/api/applications/{id}/submit", SubmitApplication).Methods("POST", "OPTIONS")

	// пользовательское удаление файлов
	r.HandleFunc("/api/files/{id}", DeleteFile).Methods("DELETE", "OPTIONS")

	// админский подмаршрут (если нужен токен)
	admin := r.PathPrefix("/api").Subrouter()
	admin.Use(AdminAuth)
	admin.HandleFunc("/applications/{id}", UpdateApplication).Methods("PATCH", "OPTIONS")
	admin.HandleFunc("/files/{id}", UpdateFileStatus).Methods("PATCH", "OPTIONS")
	// при желании сюда же можно добавить AdminDeleteFile и т.п.

	return r
}

// Очень простой CORS: разрешаем всё
func EnableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-ADMIN-TOKEN")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
