import { useEffect, useRef, useState, memo } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

const XTerminal = memo(({ streamedOutput = '', visible = true }: any) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [ready, setReady] = useState(false);

  // 1️⃣ Initialize terminal only once
  useEffect(() => {
    const term = new Terminal({ cursorBlink: true });
    const fit = new FitAddon();
    term.loadAddon(fit);
    termRef.current = term;
    fitRef.current = fit;

    return () => term.dispose();
  }, []);

  // 2️⃣ Open terminal when both ref and instance available
  useEffect(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    const container = containerRef.current;
    if (!term || !fit || !container || !visible) return;

    term.open(container);
    fit.fit();
    setReady(true);
  }, [visible]);

  // 3️⃣ Write output when ready
  useEffect(() => {
    if (ready && termRef.current) {
      termRef.current.clear();
      termRef.current.write(streamedOutput + '\r\n');
    }
  }, [streamedOutput, ready]);

  if (!visible) return null;
  return <div ref={containerRef} style={{ width: '100%', height: '300px' }} />;
});

export default XTerminal;
