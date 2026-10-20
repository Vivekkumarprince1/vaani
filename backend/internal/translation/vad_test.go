package translation

import (
	"encoding/binary"
	"testing"
)

func TestHasActiveSpeech(t *testing.T) {
	silence := make([]byte, 320)
	if HasActiveSpeech(silence) {
		t.Fatal("silence should not be detected as speech")
	}

	speech := make([]byte, 320)
	for i := 0; i < len(speech); i += 2 {
		binary.LittleEndian.PutUint16(speech[i:i+2], uint16(1000))
	}
	if !HasActiveSpeech(speech) {
		t.Fatal("non-silent PCM should be detected as speech")
	}
}
