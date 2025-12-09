package main

import (
	"log"
	"net/http"
)

func main() {
	InitDB()

	router := SetupRoutes()

	log.Println("Server started on :8080")
	if err := http.ListenAndServe(":8080", router); err != nil {
		log.Fatal(err)
	}
}
