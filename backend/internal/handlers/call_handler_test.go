package handlers

import "testing"

func TestDetectScriptLanguage(t *testing.T) {
	tests := []struct {
		name string
		text string
		want string
	}{
		{name: "english fallback", text: "hello world", want: ""},
		{name: "hindi", text: "आप कैसे हैं", want: "hi"},
		{name: "arabic", text: "مرحبا بالعالم", want: "ar"},
		{name: "japanese", text: "こんにちは", want: "ja"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := detectScriptLanguage(tt.text); got != tt.want {
				t.Fatalf("detectScriptLanguage(%q) = %q, want %q", tt.text, got, tt.want)
			}
		})
	}
}
