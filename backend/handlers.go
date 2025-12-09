package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5"
)

// POST /api/applications
func CreateApplication(w http.ResponseWriter, r *http.Request) {
	type req struct {
		HorseNameRU *string `json:"horse_name_ru"`
		HorseNameEN *string `json:"horse_name_en"`
		HorseYear   int     `json:"horse_year"`
		Notes       string  `json:"notes"`
	}

	var body req
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	ru := strings.TrimSpace(ptrToString(body.HorseNameRU))
	en := strings.TrimSpace(ptrToString(body.HorseNameEN))

	if ru == "" && en == "" {
		http.Error(w, "At least one of horse_name_ru or horse_name_en is required", http.StatusBadRequest)
		return
	}

	// 2. язык: если обе заполнены — проверяем каждую отдельно
	if ru != "" && !isCyrillic(ru) {
		http.Error(w, "horse_name_ru must contain only Cyrillic characters", http.StatusBadRequest)
		return
	}
	if en != "" && !isLatin(en) {
		http.Error(w, "horse_name_en must contain only Latin characters", http.StatusBadRequest)
		return
	}

	if body.HorseYear < 1990 || body.HorseYear > time.Now().Year() {
		http.Error(w, "horse_year out of range", http.StatusBadRequest)
		return
	}

	var ruPtr, enPtr *string
	if ru != "" {
		ruPtr = &ru
	}
	if en != "" {
		enPtr = &en
	}

	var id string
	err := DB.QueryRow(
		r.Context(),
		`INSERT INTO applications (
			id, horse_name_ru, horse_name_en, horse_year,
			status, mare_ownership_confirmed,
			genetic_done_through_association, genetic_pending,
			created_at, notes
		) VALUES (
			gen_random_uuid(), $1, $2, $3,
			'draft', false,
			false, false,
			NOW(), $4
		)
		RETURNING id`,
		ruPtr, enPtr, body.HorseYear, body.Notes,
	).Scan(&id)

	if err != nil {
		http.Error(w, "db error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	app := Application{
		ID:          id,
		HorseNameRU: ruPtr,
		HorseNameEN: enPtr,
		HorseYear:   body.HorseYear,
		Status:      "draft",
		CreatedAt:   time.Now(),
		Notes:       body.Notes,
	}

	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	enc.Encode(app)
}

// Helper: safely dereference *string → string
func ptrToString(ptr *string) string {
	if ptr == nil {
		return ""
	}
	return *ptr
}

func isCyrillic(s string) bool {
	for _, r := range s {
		if (r >= 'А' && r <= 'я') || r == 'Ё' || r == 'ё' {
			continue
		}
		return false
	}
	return true
}

func isLatin(s string) bool {
	for _, r := range s {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') {
			continue
		}
		return false
	}
	return true
}

// GET /api/applications?search=... или ?q=...
// GET /api/applications?search=. или ?q=.
func SearchApplications(w http.ResponseWriter, r *http.Request) {
	// поддерживаем оба варианта имени параметра: ?search= и ?q=
	q := strings.TrimSpace(r.URL.Query().Get("search"))
	if q == "" {
		q = strings.TrimSpace(r.URL.Query().Get("q"))
	}

	var (
		rows pgx.Rows
		err  error
	)

	if q == "" {
		// пустой запрос — отдать все (до 200) заявок
		rows, err = DB.Query(
			r.Context(),
			`SELECT id, horse_name_ru, horse_name_en, horse_year, status, created_at
			 FROM applications
			 ORDER BY created_at DESC
			 LIMIT 200`,
		)
	} else {
		// поиск подстроки по обеим кличкам
		rows, err = DB.Query(
			r.Context(),
			`SELECT id, horse_name_ru, horse_name_en, horse_year, status, created_at
			 FROM applications
			 WHERE (horse_name_ru ILIKE '%' || $1 || '%')
			    OR (horse_name_en ILIKE '%' || $1 || '%')
			 ORDER BY created_at DESC
			 LIMIT 200`,
			q,
		)
	}

	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type rowJSON struct {
		ID          string    `json:"id"`
		HorseNameRU *string   `json:"horse_name_ru,omitempty"`
		HorseNameEN *string   `json:"horse_name_en,omitempty"`
		HorseYear   int       `json:"horse_year"`
		Status      string    `json:"status"`
		CreatedAt   time.Time `json:"created_at"`
	}

	var out []rowJSON

	for rows.Next() {
		var rj rowJSON
		if err := rows.Scan(
			&rj.ID,
			&rj.HorseNameRU,
			&rj.HorseNameEN,
			&rj.HorseYear,
			&rj.Status,
			&rj.CreatedAt,
		); err != nil {
			http.Error(w, "db scan error", http.StatusInternalServerError)
			return
		}
		out = append(out, rj)
	}

	if err := rows.Err(); err != nil {
		http.Error(w, "db rows error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(out)
}

// GET /api/applications/{id}
// GET /api/applications/{id}
func GetApplication(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	var (
		appID      string
		ruName     *string
		enName     *string
		year       int
		status     string
		mareOwn    bool
		genDone    bool
		genPending bool
		createdAt  time.Time
		notes      string
	)

	err := DB.QueryRow(r.Context(),
		`SELECT id,
		        horse_name_ru,
		        horse_name_en,
		        horse_year,
		        status,
		        mare_ownership_confirmed,
		        genetic_done_through_association,
		        genetic_pending,
		        created_at,
		        COALESCE(notes, '')
		 FROM applications
		 WHERE id = $1`,
		id,
	).Scan(
		&appID,
		&ruName,
		&enName,
		&year,
		&status,
		&mareOwn,
		&genDone,
		&genPending,
		&createdAt,
		&notes,
	)

	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	// собираем структуру для JSON
	app := Application{
		ID:                            appID,
		HorseNameRU:                   ruName,
		HorseNameEN:                   enName,
		HorseYear:                     year,
		Status:                        status,
		MareOwnershipConfirmed:        mareOwn,
		GeneticDoneThroughAssociation: genDone,
		GeneticPending:                genPending,
		CreatedAt:                     createdAt,
		Notes:                         notes,
	}

	// файлы
	rows, err := DB.Query(
		r.Context(),
		`SELECT id, application_id, file_type, original_name, size_bytes, storage_path, content_type, status, uploaded_at
		   FROM files
		  WHERE application_id = $1
		  ORDER BY uploaded_at`,
		id,
	)
	if err != nil {
		http.Error(w, "db error", 500)
		return
	}
	defer rows.Close()

	var files []File
	for rows.Next() {
		var f File
		if err := rows.Scan(
			&f.ID,
			&f.ApplicationID,
			&f.FileType,
			&f.OriginalName,
			&f.SizeBytes,
			&f.StoragePath,
			&f.ContentType,
			&f.Status,
			&f.UploadedAt,
		); err != nil {
			http.Error(w, "db scan error", 500)
			return
		}
		files = append(files, f)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "db rows error", 500)
		return
	}

	result := map[string]interface{}{
		"application": app,
		"files":       files,
	}

	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(result)
}

// POST /api/applications/{id}/files  (multipart form: file, file_type)
func UploadFile(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	// check application exists
	var appStatus string
	err := DB.QueryRow(r.Context(),
		`SELECT status FROM applications WHERE id=$1`, id).
		Scan(&appStatus)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "application not found", http.StatusNotFound)
			return
		}
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	if appStatus == "complete" {
		http.Error(w, "cannot upload files to a complete application", http.StatusBadRequest)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 210<<20) // allow small overhead (210MB)
	if err := r.ParseMultipartForm(210 << 20); err != nil {
		http.Error(w, "file too large", 400)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "no file", 400)
		return
	}
	defer file.Close()
	fileType := r.FormValue("file_type")
	allowedTypes := map[string]bool{
		"passport_application": true, "ownership_or_contract": true, "breeding_or_certificate": true,
		"foal_identification_act": true, "genetic_certificate": true, "media": true,
	}
	if !allowedTypes[fileType] {
		http.Error(w, "invalid file_type", 400)
		return
	}

	// check extension
	forbidden := regexp.MustCompile(`(?i)\.(exe|bat|cmd|sh|js|jar|py)$`)
	if forbidden.MatchString(header.Filename) {
		http.Error(w, "forbidden extension", 400)
		return
	}

	// read into temp file and check size
	tmpDir := filepath.Join("storage", id)
	os.MkdirAll(tmpDir, 0755)
	// safe filename: <appid>_<filetype>_<timestamp>_<sanitized original>
	safe := sanitizeFileName(header.Filename)
	fname := fmt.Sprintf("%s_%s_%d_%s", id[:8], fileType, time.Now().Unix(), safe)
	path := filepath.Join(tmpDir, fname)

	// безопасное имя: <app_id>_<file_type>_<original_name>
	safeName := sanitizeFileName(fmt.Sprintf("%s_%s_%s", id, fileType, header.Filename))
	dir := filepath.Join("storage", id)
	os.MkdirAll(dir, 0755)
	dstPath := filepath.Join(dir, safeName)

	out, err := os.Create(dstPath)
	if err != nil {
		http.Error(w, "cannot save", 500)
		return
	}
	defer out.Close()

	written, err := io.Copy(out, file)
	if err != nil {
		http.Error(w, "write error", 500)
		return
	}
	if written > 200<<20 {
		os.Remove(dstPath)
		http.Error(w, "file too large", 400)
		return
	}

	_, err = DB.Exec(r.Context(),
		`INSERT INTO files (application_id, file_type, original_name, size_bytes, storage_path, content_type)
         VALUES ($1,$2,$3,$4,$5,$6)`,
		id, fileType, header.Filename, written, path, header.Header.Get("Content-Type"))
	if err != nil {
		http.Error(w, "db error", 500)
		return
	}

	w.WriteHeader(http.StatusCreated)
	w.Write([]byte("ok"))
}

// простая очистка имени файла
func sanitizeFileName(name string) string {
	name = filepath.Base(name)
	name = strings.ReplaceAll(name, "..", "")
	name = strings.ReplaceAll(name, "/", "_")
	name = strings.ReplaceAll(name, "\\", "_")
	return name
}

// Можно удалить только draft-файл, и только если заявка в статусе draft.
func DeleteFile(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	tx, err := DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "tx error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	var (
		path      string
		appStatus string
	)

	err = tx.QueryRow(
		r.Context(),
		`SELECT f.storage_path, a.status
		   FROM files f
		   JOIN applications a ON a.id = f.application_id
		  WHERE f.id = $1
		    AND f.status = 'draft'
		  FOR UPDATE`,
		id,
	).Scan(&path, &appStatus)

	if err != nil {
		http.Error(w, "not found or not deletable", http.StatusBadRequest)
		return
	}

	if appStatus != "draft" {
		http.Error(w, "application is not draft", http.StatusBadRequest)
		return
	}

	_ = os.Remove(path)

	if _, err := tx.Exec(r.Context(), `DELETE FROM files WHERE id=$1`, id); err != nil {
		http.Error(w, "delete failed", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "tx commit error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/files/{id} — админ (через AdminAuth).
// Можно удалить любой файл независимо от статуса.
func AdminDeleteFile(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	tx, err := DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "tx error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	var path string
	err = tx.QueryRow(
		r.Context(),
		`SELECT storage_path FROM files WHERE id=$1 FOR UPDATE`,
		id,
	).Scan(&path)

	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	_ = os.Remove(path)

	if _, err := tx.Exec(r.Context(), `DELETE FROM files WHERE id=$1`, id); err != nil {
		http.Error(w, "delete failed", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "tx commit error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// PATCH /api/applications/{id}?status=...
func UpdateApplication(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	newStatus := r.URL.Query().Get("status")
	if newStatus == "" {
		http.Error(w, "status required", 400)
		return
	}
	_, err := DB.Exec(context.Background(),
		`UPDATE applications SET status=$1 WHERE id=$2`, newStatus, id)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.WriteHeader(204)
}

// PATCH /api/files/{id}?status=...
func UpdateFileStatus(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	newStatus := r.URL.Query().Get("status")
	if newStatus == "" {
		http.Error(w, "status required", 400)
		return
	}
	_, err := DB.Exec(context.Background(),
		`UPDATE files SET status=$1 WHERE id=$2`, newStatus, id)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.WriteHeader(204)
}

// POST /api/applications/{id}/submit
// Логика: заявка остаётся в своём статусе (обычно draft),
// все её draft-файлы переводятся в sent.
func SubmitApplication(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	tx, err := DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "tx error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	var status string
	err = tx.QueryRow(
		r.Context(),
		`SELECT status FROM applications WHERE id=$1 FOR UPDATE`,
		id,
	).Scan(&status)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "application not found", http.StatusNotFound)
			return
		}
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	if status == "complete" {
		http.Error(w, "application is already complete", http.StatusBadRequest)
		return
	}

	// Переводим все draft-файлы этой заявки в sent
	_, err = tx.Exec(
		r.Context(),
		`UPDATE files SET status='sent'
		   WHERE application_id = $1
		     AND status = 'draft'`,
		id,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "tx commit error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
