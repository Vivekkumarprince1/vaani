'use client'

import { useState, useEffect, useRef } from 'react'

// ✅ Utility: check if text has audible content
const hasSound = (text) => {
  return text && /[a-zA-Z0-9\u00C0-\u017F]/.test(text)
}

export default function TextReader({
  text,
  language = 'en-US',
  autoSpeak = true,
  onSpeechEnd,
  speechRate = 1,
  speechPitch = 1,
  speechVolume = 1,
  enableManualControl = true,
}) {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error, setError] = useState(null)
  const [highlight, setHighlight] = useState(false)
  const [fontSize, setFontSize] = useState(16)

  const speechSynthRef = useRef(null)
  const utteranceRef = useRef(null)
  const queueRef = useRef([]) // ✅ holds speech queue
  const previousTextRef = useRef('')
  const textRef = useRef(null)

  // Initialize speechSynthesis safely
  useEffect(() => {
    if (typeof window !== 'undefined') {
      speechSynthRef.current = window.speechSynthesis
    }
  }, [])

  // Main speaking function
  const startSpeaking = async (textToSpeak) => {
    try {
      const utterance = new SpeechSynthesisUtterance(textToSpeak)
      utteranceRef.current = utterance

      // Just set language if provided
      if (language) {
        utterance.lang = language
      }

      // Speech parameters
      utterance.rate = speechRate
      utterance.pitch = speechPitch
      utterance.volume = speechVolume

      // Event handlers
      utterance.onstart = () => {
        setIsSpeaking(true)
        console.log(`🔊 Speaking: "${textToSpeak.substring(0, 50)}..."`)
      }

      utterance.onend = () => {
        setIsSpeaking(false)
        utteranceRef.current = null
        console.log('✅ Speech completed')

        // Process next in queue
        if (queueRef.current.length > 0) {
          const nextText = queueRef.current.shift()
          setTimeout(() => startSpeaking(nextText), 100)
        }

        if (onSpeechEnd) onSpeechEnd()
      }

      utterance.onerror = (event) => {
        if (event.error === 'canceled') {
          console.log('ℹ️ Speech canceled by user or browser')
          return
        }
        console.error('❌ Speech synthesis error:', event.error)
        setError(`Speech error: ${event.error}`)
        setIsSpeaking(false)
        utteranceRef.current = null
      }

      speechSynthRef.current.speak(utterance)
      console.log('✅ Speech queued')
    } catch (error) {
      console.error('❌ Failed to start speech:', error)
      setError(`Failed to start speech: ${error.message}`)
      setIsSpeaking(false)
      utteranceRef.current = null
    }
  }

  // Stop speaking
  const stopSpeaking = () => {
    if (speechSynthRef.current && speechSynthRef.current.speaking) {
      speechSynthRef.current.cancel()
      setIsSpeaking(false)
      utteranceRef.current = null
      queueRef.current = [] // clear queue
      console.log('🛑 Speech stopped')
    }
  }

  // Queue text or start immediately
  const speakText = (textToSpeak) => {
    if (!textToSpeak.trim() || !hasSound(textToSpeak)) return
    if (isSpeaking || speechSynthRef.current?.speaking) {
      queueRef.current.push(textToSpeak)
      console.log('⏳ Speech queued in line')
    } else {
      startSpeaking(textToSpeak)
    }
  }

  // Handle new incoming text
  useEffect(() => {
    if (!text || text === previousTextRef.current) return

    console.log('📝 New text:', text)
    setHighlight(true)
    setTimeout(() => setHighlight(false), 1000)

    if (autoSpeak && hasSound(text)) {
      speakText(text)
    }

    previousTextRef.current = text

    if (textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight
    }
  }, [text])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSpeaking()
    }
  }, [])

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      {/* Text display */}
      <div
        ref={textRef}
        className={`border rounded-lg p-4 mb-4 max-h-48 overflow-y-auto transition-colors duration-500 ${
          highlight ? 'bg-yellow-50' : 'bg-white'
        }`}
        style={{ fontSize: `${fontSize}px` }}
      >
        {text || 'No text yet...'}
      </div>

      {/* Controls */}
      {enableManualControl && (
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              if (isSpeaking) {
                stopSpeaking()
              } else {
                speakText(text)
              }
            }}
            className={`px-4 py-2 rounded ${
              isSpeaking ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
            }`}
          >
            {isSpeaking ? 'Stop' : 'Speak'}
          </button>

          <button
            onClick={() => setFontSize((s) => Math.max(s - 2, 10))}
            className="px-3 py-2 rounded bg-gray-200"
          >
            A-
          </button>
          <button
            onClick={() => setFontSize((s) => Math.min(s + 2, 30))}
            className="px-3 py-2 rounded bg-gray-200"
          >
            A+
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-2 text-red-500">
          ⚠️ {error}
        </div>
      )}
    </div>
  )
}
