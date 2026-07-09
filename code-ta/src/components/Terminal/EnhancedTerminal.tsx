import React, { useState, useRef, useEffect } from 'react';
import XTerminal from './Terminal';
import { ChevronDown, Plus, X, Terminal as TerminalIcon } from 'lucide-react';

interface TerminalTab {
  id: string;
  name: string;
  type: 'bash' | 'powershell' | 'cmd' | 'git-bash' | 'ubuntu' | 'zsh';
  active: boolean;
}

interface EnhancedTerminalProps {
  terminalRef?: React.RefObject<any>;
}

const TERMINAL_TYPES = [
  { value: 'bash', label: 'Bash', icon: '🐧' },
  { value: 'powershell', label: 'PowerShell', icon: '🔷' }