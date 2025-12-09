package main

import (
	"net/http"
	"os"
)

// AdminAuth — простая проверка токена администратора
func AdminAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get("X-ADMIN-TOKEN")
		if token == "" || token != os.Getenv("ADMIN_TOKEN") {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}
