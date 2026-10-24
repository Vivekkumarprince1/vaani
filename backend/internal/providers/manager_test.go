package providers

import "testing"

func TestExtractTranslations(t *testing.T) {
	tests := []struct {
		name          string
		raw           string
		expectedCount int
		wantFirst     string
		wantOK        bool
	}{
		{
			name:          "clean json array",
			raw:           `["नमस्ते, आप कैसे हैं?"]`,
			expectedCount: 1,
			wantFirst:     "नमस्ते, आप कैसे हैं?",
			wantOK:        true,
		},
		{
			name:          "reasoning model with think block containing brackets",
			raw:           "<think>\nLet's translate [\"Hello\"] into Hindi.\n</think>\n[\"नमस्ते\"]",
			expectedCount: 1,
			wantFirst:     "नमस्ते",
			wantOK:        true,
		},
		{
			name:          "markdown json fence",
			raw:           "```json\n[\"Привет\"]\n```",
			expectedCount: 1,
			wantFirst:     "Привет",
			wantOK:        true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := extractTranslations(tt.raw, tt.expectedCount)
			if ok != tt.wantOK {
				t.Fatalf("extractTranslations(%q) ok = %v, want %v", tt.raw, ok, tt.wantOK)
			}
			if ok && (len(got) == 0 || got[0] != tt.wantFirst) {
				t.Fatalf("extractTranslations(%q) = %v, want first %q", tt.raw, got, tt.wantFirst)
			}
		})
	}
}

func TestIsWhisperHallucination(t *testing.T) {
	if !isWhisperHallucination("Thank you for watching.") {
		t.Fatal("expected 'Thank you for watching.' to be flagged as hallucination")
	}
	if !isWhisperHallucination("Субтитры сделал DimaTorzok") {
		t.Fatal("expected DimaTorzok subtitle credit to be flagged as hallucination")
	}
	if isWhisperHallucination("Hello, can you hear me clearly?") {
		t.Fatal("expected real conversational sentence not to be flagged as hallucination")
	}
}

func TestNormalizeLanguageCode(t *testing.T) {
	if got := NormalizeLanguageCode("hi-IN"); got != "hi" {
		t.Fatalf("expected 'hi', got %q", got)
	}
	if got := NormalizeLanguageCode("Russian"); got != "ru" {
		t.Fatalf("expected 'ru', got %q", got)
	}
	if got := NormalizeLanguageCode("auto"); got != "" {
		t.Fatalf("expected empty string for 'auto', got %q", got)
	}
}
