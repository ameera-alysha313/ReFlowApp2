import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './auth-context';
import { logEvent } from '../utils/log-event';

// Minutes since midnight, e.g. 9:30 am = 570
type Schedule = { wakeMin: number; sleepMin: number };
const DEFAULT: Schedule = { wakeMin: 9 * 60, sleepMin: 23 * 60 };

type ScheduleContextType = Schedule & { setSchedule: (s: Schedule) => void };
const ScheduleContext = createContext<ScheduleContextType | undefined>(undefined);

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [schedule, setScheduleState] = useState<Schedule>(DEFAULT);

  useEffect(() => {
    if (!uid) { setScheduleState(DEFAULT); return; }
    AsyncStorage.getItem(`schedule2:${uid}`)
      .then(raw => { if (raw) setScheduleState(JSON.parse(raw)); })
      .catch(() => {});
  }, [uid]);

  const setSchedule = (s: Schedule) => {
    setScheduleState(s);
    if (!uid) return;
    AsyncStorage.setItem(`schedule2:${uid}`, JSON.stringify(s)).catch(() => {});
    logEvent(uid, 'schedule_set', s);
  };

  return (
    <ScheduleContext.Provider value={{ ...schedule, setSchedule }}>
      {children}
    </ScheduleContext.Provider>
  );
}

export function useSchedule() {
  const ctx = useContext(ScheduleContext);
  if (!ctx) throw new Error('useSchedule must be used within ScheduleProvider');
  return ctx;
}