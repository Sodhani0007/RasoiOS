"use client";

import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, AlertCircle, Globe, RefreshCw } from "lucide-react";

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal: boolean;
      length: number;
    };
    length: number;
  };
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

interface VoiceInputProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: (val: string) => void;
  isProcessing?: boolean;
}

export function VoiceInput({
  value,
  onChange,
  onSubmit,
  isProcessing = false,
}: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [selectedLang, setSelectedLang] = useState("hi-IN");
  const [speechSupported, setSpeechSupported] = useState(true);
  const [speechError, setSpeechError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const win = typeof window !== "undefined" ? (window as unknown as IWindow) : null;
    const SpeechRec = win?.SpeechRecognition || win?.webkitSpeechRecognition;

    if (!SpeechRec) {
      setSpeechSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = selectedLang;

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          onChange(value ? `${value} ${finalTranscript.trim()}` : finalTranscript.trim());
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn("Speech recognition error:", event.error);
        if (event.error === "not-allowed") {
          setSpeechError("Microphone access was denied. Please allow microphone permissions or type manually.");
        } else if (event.error === "no-speech") {
          // Normal timeout if nothing was said
        } else {
          setSpeechError(`Speech recognition error: ${event.error}. You can type manually.`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch (err) {
      console.warn("Failed to initialize SpeechRecognition:", err);
      setSpeechSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, [selectedLang]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
    } else {
      setSpeechError(null);
      try {
        recognitionRef.current.lang = selectedLang;
        recognitionRef.current.start();
      } catch (err: any) {
        console.warn("Could not start speech recognition:", err);
        setSpeechError("Could not start microphone. You can type manually.");
        setIsListening(false);
      }
    }
  };

  const handleLangChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    setSelectedLang(newLang);
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
    }
  };

  return (
    <div className="voice-input-card">
      <div className="voice-input-header">
        <div className="voice-lang-selector">
          <Globe size={16} />
          <label htmlFor="voice-lang" className="sr-only">Speech Recognition Language</label>
          <select
            id="voice-lang"
            value={selectedLang}
            onChange={handleLangChange}
            disabled={isListening || isProcessing}
          >
            <option value="hi-IN">Hindi / Hinglish (hi-IN)</option>
            <option value="en-IN">English (India) (en-IN)</option>
            <option value="mr-IN">Marathi (mr-IN)</option>
          </select>
          <small className="muted text-xs">
            Hinglish accuracy depends on browser speech engine.
          </small>
        </div>

        {speechSupported && (
          <button
            type="button"
            className={`button mic-button ${isListening ? "listening" : "secondary"}`}
            onClick={toggleListening}
            disabled={isProcessing}
            title={isListening ? "Stop listening" : "Start speaking"}
          >
            {isListening ? (
              <>
                <MicOff size={18} className="pulse-icon" /> Stop listening
              </>
            ) : (
              <>
                <Mic size={18} /> Speak command
              </>
            )}
          </button>
        )}
      </div>

      {!speechSupported && (
        <div className="notice-box info">
          <AlertCircle size={16} />
          <span>
            Browser Speech Recognition is not supported in this browser. You can type your kitchen command manually below.
          </span>
        </div>
      )}

      {speechError && (
        <div className="notice-box error">
          <AlertCircle size={16} />
          <span>{speechError}</span>
        </div>
      )}

      {isListening && (
        <div className="listening-indicator">
          <span className="dot pulse" /> Listening... Speak naturally (e.g. &ldquo;Aaj paneer khatam ho gaya&rdquo;)
        </div>
      )}

      <div className="transcript-box">
        <label htmlFor="manual-transcript">
          <strong>Kitchen Command / Transcript:</strong>
        </label>
        <textarea
          id="manual-transcript"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Speak or type: e.g. 'Aaj paneer khatam ho gaya, palak aadha kilo hai, aur dadi ka vrat hai.'"
          disabled={isProcessing}
        />
        <div className="transcript-actions">
          <button
            type="button"
            className="button secondary sm"
            onClick={() => onChange("")}
            disabled={!value || isProcessing}
          >
            Clear
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => onSubmit(value)}
            disabled={!value.trim() || isProcessing}
          >
            {isProcessing ? (
              <>
                <RefreshCw size={16} className="spin" /> Interpreting...
              </>
            ) : (
              "Interpret with AI"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
