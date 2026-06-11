import React, { useState, useEffect, useRef, useCallback } from 'react';

interface Props {
  onBoot: () => void;
}

interface Line {
  text: string;
  cls: string;
  delay: number;
}

const BOOT_SEQUENCE: Line[] = [
  { text: '╔══════════════════════════════════════════════════╗', cls: 'dim',  delay: 0   },
  { text: '║         ██████╗ ███████╗ ██████╗ ███╗   ███╗   ║', cls: 'bold', delay: 80  },
  { text: '║        ██╔════╝ ██╔════╝██╔═══██╗████╗ ████║   ║', cls: 'bold', delay: 160 },
  { text: '║        ██║  ███╗█████╗  ██║   ██║██╔████╔██║   ║', cls: 'bold', delay: 240 },
  { text: '║        ██║   ██║██╔══╝  ██║   ██║██║╚██╔╝██║   ║', cls: 'bold', delay: 320 },
  { text: '║        ╚██████╔╝███████╗╚██████╔╝██║ ╚═╝ ██║   ║', cls: 'bold', delay: 400 },
  { text: '║         ╚═════╝ ╚══════╝ ╚═════╝ ╚═╝     ╚═╝   ║', cls: 'bold', delay: 480 },
  { text: '║              MOCK // v3.0.0 // PHASE-3           ║', cls: 'dim',  delay: 560 },
  { text: '╚══════════════════════════════════════════════════╝', cls: 'dim',  delay: 640 },
  { text: '',                                                     cls: 'dim',  delay: 720 },
  { text: '> Booting GeoMock kernel...',                          cls: 'bold', delay: 800 },
  { text: '> Detecting hardware resources...',                    cls: 'dim',  delay: 1000},
  { text: '  CPU  ............. 16 cores @ 4.2GHz    [OK]',      cls: 'ok',   delay: 1200},
  { text: '  RAM  ............. 32 GiB DDR5           [OK]',      cls: 'ok',   delay: 1400},
  { text: '  GPU  ............. Canvas2D accelerated  [OK]',      cls: 'ok',   delay: 1600},
  { text: '> Initializing simulation subsystems...',              cls: 'dim',  delay: 1850},
  { text: '  Redis Stream  .... localhost:6379        [PING]',    cls: 'warn', delay: 2050},
  { text: '  Redis Stream  .... latency 0.4ms         [OK]',      cls: 'ok',   delay: 2350},
  { text: '  WebSocket Hub .... ws://localhost:8080   [CONNECT]', cls: 'warn', delay: 2600},
  { text: '  WebSocket Hub .... handshake success     [OK]',      cls: 'ok',   delay: 2950},
  { text: '  Agent Pool  ...... 1000 drivers loaded   [OK]',      cls: 'ok',   delay: 3150},
  { text: '  Canvas Renderer .. 60 FPS lock engaged   [OK]',      cls: 'ok',   delay: 3350},
  { text: '',                                                     cls: 'dim',  delay: 3550},
  { text: '> All systems nominal. Matrix engine is READY.',       cls: 'bold', delay: 3700},
  { text: '',                                                     cls: 'dim',  delay: 3900},
];

export const CoreTerminalIntro: React.FC<Props> = ({ onBoot }) => {
  const [lines, setLines] = useState<Line[]>([]);
  const [showButton, setShowButton] = useState(false);
  const [glitching, setGlitching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    BOOT_SEQUENCE.forEach((line) => {
      timers.push(
        setTimeout(() => {
          setLines(prev => [...prev, line]);
          // Scroll to bottom
          if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
          }
        }, line.delay)
      );
    });

    // Show button after all lines printed
    const lastDelay = BOOT_SEQUENCE[BOOT_SEQUENCE.length - 1].delay + 400;
    timers.push(setTimeout(() => setShowButton(true), lastDelay));

    return () => timers.forEach(clearTimeout);
  }, []);

  const handleConnect = useCallback(() => {
    setGlitching(true);
    setTimeout(() => onBoot(), 620);
  }, [onBoot]);

  return (
    <div className={`terminal-screen ${glitching ? 'glitch-out' : ''}`}>
      {/* Scanline overlay is handled by terminal-screen::before in CSS */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {lines.map((line, i) => (
          <div key={i} className={`terminal-line ${line.cls}`}>
            {line.text}
          </div>
        ))}
        {!showButton && <span className="cursor" />}
      </div>

      {showButton && (
        <div style={{ marginTop: '1.5rem', position: 'relative', zIndex: 2 }}>
          <div className="terminal-line dim" style={{ marginBottom: '1rem' }}>
            {'> Awaiting operator authorization...'}
          </div>
          <button className="btn-cyber" onClick={handleConnect}>
            ▶ CONNECT TO MATRIX ENGINE
          </button>
        </div>
      )}
    </div>
  );
};
