import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useAuth } from './auth-context';
import { logEvent } from '../utils/log-event';

export type Mode = 'High' | 'Medium' | 'Low' | 'Recovery';

type ModeContextType = {
  mode: Mode;
  setMode: (mode: Mode) => void;
};

const ModeContext = createContext<ModeContextType | undefined>(undefined);

export function ModeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [mode, setModeState] = useState<Mode>('Medium');
  const setMode = (next: Mode) => {
  if (next === mode) return;
  logEvent(user?.uid ?? null, 'mode_switched', { from: mode, to: next });
  setModeState(next);
};

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error('useMode must be used within ModeProvider');
  return ctx;
}