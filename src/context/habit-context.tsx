import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AppState } from 'react-native';
import { collection, addDoc, deleteDoc, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import { useAuth } from './auth-context';
import { useTasks, ESSENTIAL_TAGS } from './task-context';
import { logEvent } from '../utils/log-event';
import { dateKey } from '../utils/date-key';

// days: 0 = Sunday ... 6 = Saturday
export type Habit = { id: string; title: string; tag?: string; days: number[]; createdAt?: number };
type NewHabit = { title: string; tag?: string; days: number[] };

type HabitsContextType = {
  habits: Habit[];
  addHabit: (h: NewHabit) => void;
  deleteHabit: (id: string) => void;
};

const HabitsContext = createContext<HabitsContextType | undefined>(undefined);

export function HabitsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { tasks } = useTasks();
  const [habits, setHabits] = useState<Habit[]>([]);

  useEffect(() => {
    if (!uid) { setHabits([]); return; }
    const unsub = onSnapshot(
      collection(db, 'users', uid, 'habits'),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Habit, 'id'>) }));
        list.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
        setHabits(list);
      },
      err => console.warn('Habits listen failed', err)
    );
    return unsub;
  }, [uid]);

  // Make today's task for every habit scheduled today.
  // The id is "<habitId>_<date>", so it can never be created twice.
  useEffect(() => {
    if (!uid) return;
    const generate = async () => {
      const today = dateKey();
      const dow = new Date().getDay();
      for (const h of habits) {
        if (!h.days.includes(dow)) continue;
        const ref = doc(db, 'users', uid, 'tasks', `${h.id}_${today}`);
        try {
          if ((await getDoc(ref)).exists()) continue;
          const essential = !!h.tag && ESSENTIAL_TAGS.includes(h.tag);
          await setDoc(ref, {
            title: h.title,
            ...(h.tag ? { tag: h.tag } : {}),
            completed: false,
            deadline: today,
            important: false,
            priority: essential ? 'High' : 'Low',
            createdAt: Date.now(),
            habitId: h.id,
            habitDate: today,
            friction: 0.2,                 // habits are familiar, so easy to start
            stakes: essential ? 0.8 : 0.3, // essentials matter more if skipped
          });
        } catch (e) {
          console.warn('Habit generate failed', e);
        }
      }
    };
    generate();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') generate(); });
    return () => sub.remove();
  }, [uid, habits]);

  // Unfinished habit tasks from earlier days quietly disappear (no overdue pile-up)
  useEffect(() => {
    if (!uid) return;
    const today = dateKey();
    tasks
      .filter(t => t.habitId && !t.completed && t.habitDate && t.habitDate < today)
      .forEach(t => deleteDoc(doc(db, 'users', uid, 'tasks', t.id)).catch(() => {}));
  }, [uid, tasks]);

  const addHabit = (h: NewHabit) => {
    if (!uid) return;
    addDoc(collection(db, 'users', uid, 'habits'), {
      title: h.title,
      days: h.days,
      ...(h.tag ? { tag: h.tag } : {}),
      createdAt: Date.now(),
    })
      .then(ref => logEvent(uid, 'habit_created', { habitId: ref.id, tag: h.tag ?? null, dayCount: h.days.length }))
      .catch(e => console.warn('Add habit failed', e));
  };

  const deleteHabit = (id: string) => {
    if (!uid) return;
    // remove today's unfinished instance too
    tasks
      .filter(t => t.habitId === id && !t.completed)
      .forEach(t => deleteDoc(doc(db, 'users', uid, 'tasks', t.id)).catch(() => {}));
    deleteDoc(doc(db, 'users', uid, 'habits', id))
      .then(() => logEvent(uid, 'habit_deleted', { habitId: id }))
      .catch(e => console.warn('Delete habit failed', e));
  };

  return (
    <HabitsContext.Provider value={{ habits, addHabit, deleteHabit }}>
      {children}
    </HabitsContext.Provider>
  );
}

export function useHabits() {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error('useHabits must be used within HabitsProvider');
  return ctx;
}
