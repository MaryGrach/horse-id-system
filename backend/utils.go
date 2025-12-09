package main

import (
	"errors"
	"unicode"
)

// Возвращает "ru" или "en" или error, если смешанные/невалидные
func detectLanguage(s string) (string, error) {
	hasCyr := false
	hasLat := false
	for _, r := range s {
		if unicode.Is(unicode.Cyrillic, r) {
			hasCyr = true
		} else if unicode.Is(unicode.Latin, r) {
			hasLat = true
		} else if unicode.IsSpace(r) || r == '-' || r == '\'' {
			continue
		}
		if hasCyr && hasLat {
			return "", errors.New("mixed latin and cyrillic characters")
		}
	}
	if hasCyr {
		return "ru", nil
	}
	if hasLat {
		return "en", nil
	}
	return "", errors.New("cannot detect language")
}
