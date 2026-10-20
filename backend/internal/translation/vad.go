package translation

import (
	"encoding/binary"
	"math"
)

// DefaultSilenceThreshold is the minimum PCM-16 amplitude considered active speech
const DefaultSilenceThreshold = 120.0

// HasActiveSpeech analyzes 16-bit Linear PCM audio chunks to determine if speech energy exists
func HasActiveSpeech(pcmBytes []byte, threshold ...float64) bool {
	th := DefaultSilenceThreshold
	if len(threshold) > 0 && threshold[0] > 0 {
		th = threshold[0]
	}

	if len(pcmBytes) < 4 {
		return false
	}

	var sumSquares float64
	sampleCount := len(pcmBytes) / 2

	for i := 0; i < len(pcmBytes)-1; i += 2 {
		sample := int16(binary.LittleEndian.Uint16(pcmBytes[i : i+2]))
		sumSquares += float64(sample) * float64(sample)
	}

	if sampleCount == 0 {
		return false
	}

	rms := math.Sqrt(sumSquares / float64(sampleCount))
	return rms > th
}
