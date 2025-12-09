package main

import "time"

type Application struct {
	ID                            string    `json:"id"`
	HorseNameRU                   *string   `json:"horse_name_ru,omitempty"`
	HorseNameEN                   *string   `json:"horse_name_en,omitempty"`
	HorseYear                     int       `json:"horse_year"`
	Status                        string    `json:"status"`
	MareOwnershipConfirmed        bool      `json:"mare_ownership_confirmed"`
	GeneticDoneThroughAssociation bool      `json:"genetic_done_through_association"`
	GeneticPending                bool      `json:"genetic_pending"`
	CreatedAt                     time.Time `json:"created_at"`
	Notes                         string    `json:"notes"`
}
type File struct {
	ID            string    `json:"id"`
	ApplicationID string    `json:"application_id"`
	FileType      string    `json:"file_type"`
	OriginalName  string    `json:"original_name"`
	SizeBytes     int64     `json:"size_bytes"`
	StoragePath   string    `json:"storage_path"`
	ContentType   string    `json:"content_type"`
	Status        string    `json:"status"`
	UploadedAt    time.Time `json:"uploaded_at"`
}
