import React, { createContext, useContext, useState, ReactNode, useEffect, useRef} from 'react';
import { AppState } from 'react-native';
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
const modeRef = useRef(mode);
modeRef.current = mode;

// Log when the app is actually open, so mode time isn't counted while it's closed
useEffect(() => {
  if (!user?.uid) return;
  const uid = user.uid;
  logEvent(uid, 'app_state', { state: 'active', mode: modeRef.current });
  const sub = AppState.addEventListener('change', next => {
    logEvent(uid, 'app_state', { state: next === 'active' ? 'active' : 'inactive', mode: modeRef.current });
  });
  return () => sub.remove();
}, [user?.uid]);

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