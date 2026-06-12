import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, MicOff, Loader2, Sparkles } from 'lucide-react';
import { useMetrics } from '../hooks/useMetrics';

interface Message {
  role: 'user' | 'ai';
  content: string;
}

// Ensure TypeScript knows about SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const QUICK_CHIPS = [
  "Why is my error rate spiking?",
  "How do I handle 2000 concurrent agents?",
  "What's causing high p95 latency?"
];

export const AIDiagnosticsPanel: React.FC = () => {
  const { metrics, topology } = useMetrics();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', content: "Hello. I am the GEOMOCK Matrix AI Diagnostics Assistant. How can I help you optimize your pipeline today?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Speech Recognition State
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom whenever messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    // Initialize Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        setInput(prev => prev + (prev ? ' ' : '') + finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, []);

  const toggleListen = () => {
    if (!speechSupported) return;
    
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        console.error("Failed to start speech recognition:", e);
      }
    }
  };

  const handleSend = async (text: string = input) => {
    if (!text.trim()) return;

    // Add user message
    const newMessages = [...messages, { role: 'user' as const, content: text }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    if (isListening) {
      toggleListen(); // Stop listening when sending
    }

    // Build context
    const contextData = {
      metrics: {
        rps: metrics.currentRps,
        httpFailures: metrics.httpFailures,
        p95ResponseTimeMs: metrics.p95ResponseTime,
        p50ResponseTimeMs: metrics.p50ResponseTime,
        p99ResponseTimeMs: metrics.p99ResponseTime,
        totalRequests: metrics.totalRequestsMade
      },
      topologyNodes: topology?.nodes?.map(n => ({
        name: n.name,
        group: n.group
      })) || []
    };

    try {
      const response = await fetch('http://localhost:8080/api/diagnostics/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          context: JSON.stringify(contextData)
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      setMessages([...newMessages, { role: 'ai', content: data.reply || "No response received." }]);
    } catch (error) {
      console.error("Diagnostics error:", error);
      setMessages([...newMessages, { role: 'ai', content: "Error: Could not reach diagnostics backend. Please ensure the server is running." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="diagnostics-panel" style={{ flex: 1, minWidth: 0 }}>
      {/* Header */}
      <div className="diagnostics-header" style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Sparkles size={18} color="var(--primary)" />
          <h2 style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--on-dark)' }}>
            AI DIAGNOSTICS
          </h2>
        </div>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ink-mute-2)', fontFamily: 'var(--font-ui)' }}>
          Analyze telemetry and optimize your pipeline
        </p>
      </div>

      {/* Message History */}
      <div className="diagnostics-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message-row ${msg.role === 'user' ? 'row-user' : 'row-ai'}`}>
            <div className={`message-bubble ${msg.role === 'user' ? 'bubble-user' : 'bubble-ai'}`}>
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message-row row-ai">
            <div className="message-bubble bubble-ai" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Loader2 size={16} className="spin-anim" color="var(--primary)" />
              <span style={{ color: 'var(--primary)' }}>Analyzing telemetry...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="diagnostics-input-area">
        <div className="diagnostics-input-wrapper">
          {/* Quick Chips */}
          <div className="diagnostics-chips">
            {QUICK_CHIPS.map((chip, idx) => (
              <button 
                key={idx} 
                className="diagnostics-chip"
                onClick={() => handleSend(chip)}
                disabled={isLoading}
              >
                {chip}
              </button>
            ))}
          </div>

          {!speechSupported && (
            <div style={{ fontSize: '0.7rem', color: 'var(--ink-mute-2)', marginBottom: '0.5rem', textAlign: 'center' }}>
              * Speech recognition not supported in this browser.
            </div>
          )}

          <div className="diagnostics-input-container">
            <button 
              className={`diagnostics-mic-btn ${isListening ? 'listening' : ''}`}
              onClick={toggleListen}
              disabled={!speechSupported || isLoading}
              title={speechSupported ? "Voice Input" : "Unsupported"}
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              {isListening && <span className="mic-pulse" />}
            </button>
            
            <input
              type="text"
              className="diagnostics-input"
              placeholder={isListening ? "Listening..." : "Describe an issue..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
              }}
              disabled={isLoading}
            />
            
            <button 
              className="diagnostics-send-btn"
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
