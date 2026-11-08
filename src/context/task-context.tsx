import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, deleteField, doc, onSnapshot,
  getDocs, query, where,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../config/firebaseConfig';
import { useAuth } from './auth-context';
import { logEvent } from '../utils/log-event';
import { breakDownTask } from '../utils/task-breakdown';

export type Priority = 'High' | 'Medium' | 'Low';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export type Subtask = { id: string; title: string; done: boolean };
export type Task = {
  id: string;
  title: string;
  completed: boolean;
  deadline?: string;
  tag?: string;
  important: boolean;
  priority: Priority;
  createdAt?: number;
  completedAt?: number;
  subtasks?: Subtask[];
  friction?: number;
  stakes?: number;
  timeOfDay?: TimeOfDay; // soft "usually around" time chosen by the user
  habitId?: string;   // set on tasks generated from a recurring habit
  habitDate?: string; // the day (YYYY-MM-DD) this instance belongs to
};

type NewTask = Omit<Task, 'id' | 'completed' | 'createdAt' | 'completedAt'>;

type TasksContextType = {
  tasks: Task[];
  tags: string[];        // presets + custom
  customTags: string[];  // only the user's own (these can be renamed/deleted)
  addTask: (task: NewTask) => void;
  toggleTask: (id: string, source?: string) => void;
  updateTask: (id: string, changes: Partial<NewTask>) => void;
  deleteTask: (id: string) => void;
  addTag: (tag: string) => void;
  renameTag: (oldTag: string, newTag: string) => void;
  deleteTag: (tag: string) => void;
};

export const PRESET_TAGS = ['Study', 'Chores', 'Admin', 'Personal', 'Hygiene', 'Health'];
// Habits with these tags stay visible in every mode except Recovery
export const ESSENTIAL_TAGS = ['Hygiene', 'Health'];

const sameTag = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const isPreset = (t: string) => PRESET_TAGS.some(p => sameTag(p, t));

const TasksContext = createContext<TasksContextType | undefined>(undefined);

export function TasksProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [savedTags, setSavedTags] = useState<string[]>([]);

  // Live-listen to user's tasks; reset everything on logout
  useEffect(() => {
    if (!uid) {
      setTasks([]);
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'users', uid, 'tasks'),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Task, 'id'>) }));
        list.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
        setTasks(list);
      },
      err => console.warn('Firestore listen failed', err)
    );
    return unsub;
  }, [uid]);

  // Custom tags are saved on the device, per user
  useEffect(() => {
    if (!uid) { setSavedTags([]); return; }
    AsyncStorage.getItem(`tags:${uid}`)
      .then(raw => { if (raw) setSavedTags(JSON.parse(raw)); })
      .catch(() => {});
  }, [uid]);

  const saveCustom = (list: string[]) => {
    setSavedTags(list);
    if (uid) AsyncStorage.setItem(`tags:${uid}`, JSON.stringify(list)).catch(() => {});
  };

  // Saved tags + any custom tag already used on a task (so older tags reappear)
  const customTags = useMemo(() => {
    const out = [...savedTags];
    tasks.forEach(t => {
      if (t.tag && !isPreset(t.tag) && !out.some(o => sameTag(o, t.tag!))) out.push(t.tag);
    });
    return out;
  }, [savedTags, tasks]);

  const tags = [...PRESET_TAGS, ...customTags];

  const addTask = (task: NewTask) => {
    if (!uid) return;
    addDoc(collection(db, 'users', uid, 'tasks'), {
      ...task, completed: false, createdAt: Date.now(),
    })
      .then(ref => {
        logEvent(uid, 'task_created', {
          taskId: ref.id, tag: task.tag, priority: task.priority, hasDeadline: !!task.deadline,
        });
        // Background breakdown + difficulty estimate, so it's ready when the task is opened
        breakDownTask({ ...task, id: ref.id, completed: false } as Task, 'Medium').then(r => {
          if (r.source === 'generic') return; // leave empty so the button can retry later
          updateDoc(doc(db, 'users', uid, 'tasks', ref.id), {
            subtasks: r.subtasks,
            ...(r.friction !== undefined ? { friction: r.friction } : {}),
            ...(r.stakes !== undefined ? { stakes: r.stakes } : {}),
          });
          logEvent(uid, 'task_broken_down', {
            taskId: ref.id, source: r.source, count: r.subtasks.length,
            mode: 'Medium', model: r.model ?? null, ms: r.ms, auto: true,
          });
        });
      })
      .catch(e => console.warn('Add task failed', e));
  };

  const toggleTask = (id: string, source?: string) => {
    if (!uid) return;
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const nowCompleted = !task.completed;
    updateDoc(doc(db, 'users', uid, 'tasks', id), {
      completed: nowCompleted,
      completedAt: nowCompleted ? Date.now() : deleteField(),
    })
      .then(() => logEvent(uid, nowCompleted ? 'task_completed' : 'task_uncompleted', { taskId: id, ...(source ? { source } : {}) }))
      .catch(e => console.warn('Toggle failed', e));
  };

  const updateTask = (id: string, changes: Partial<NewTask>) => {
    if (!uid) return;
    const before = tasks.find(t => t.id === id);
    // undefined = "field was cleared", so actually remove it from Firestore
    const clean = Object.fromEntries(
      Object.entries(changes).map(([k, v]) => [k, v === undefined ? deleteField() : v])
    );
    updateDoc(doc(db, 'users', uid, 'tasks', id), clean)
      .then(() => logEvent(uid, 'task_updated', {
        taskId: id,
        oldDeadline: before?.deadline ?? null,
        newDeadline: 'deadline' in changes ? (changes.deadline ?? null) : (before?.deadline ?? null),
      }))
      .catch(e => console.warn('Update failed', e));
  };

  const deleteTask = (id: string) => {
    if (!uid) return;
    deleteDoc(doc(db, 'users', uid, 'tasks', id))
      .then(() => logEvent(uid, 'task_deleted', { taskId: id }))
      .catch(e => console.warn('Delete failed', e));
  };

  const addTag = (tag: string) => {
    const clean = tag.trim();
    if (!clean || tags.some(t => sameTag(t, clean))) return;
    saveCustom([...savedTags, clean]);
  };

  // Change (or remove, when `to` is undefined) a tag on every task and habit that uses it
  const retag = async (from: string, to: string | undefined) => {
    if (!uid) return;
    const value = to === undefined ? deleteField() : to;
    try {
      tasks
        .filter(t => t.tag === from)
        .forEach(t => updateDoc(doc(db, 'users', uid, 'tasks', t.id), { tag: value }));
      const snap = await getDocs(query(collection(db, 'users', uid, 'habits'), where('tag', '==', from)));
      snap.forEach(d => updateDoc(d.ref, { tag: value }));
    } catch (e) {
      console.warn('Retag failed', e);
    }
  };

  const renameTag = (oldTag: string, next: string) => {
    const clean = next.trim();
    if (!uid || !clean || isPreset(oldTag) || clean === oldTag) return;
    if (!sameTag(oldTag, clean) && tags.some(t => sameTag(t, clean))) return; // name taken
    saveCustom(
      savedTags.includes(oldTag)
        ? savedTags.map(t => (t === oldTag ? clean : t))
        : [...savedTags, clean]
    );
    retag(oldTag, clean);
  };

  const deleteTag = (tag: string) => {
    if (!uid || isPreset(tag)) return;
    saveCustom(savedTags.filter(t => t !== tag));
    retag(tag, undefined);
  };

  return (
    <TasksContext.Provider
      value={{ tasks, tags, customTags, addTask, toggleTask, updateTask, deleteTask, addTag, renameTag, deleteTag }}
    >
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used within TasksProvider');
  return ctx;
}
