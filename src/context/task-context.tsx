import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { collection, addDoc, updateDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import { useAuth } from './auth-context';
import { logEvent } from '../utils/log-event';

export type Priority = 'High' | 'Medium' | 'Low';

export type Task = {
  id: string;
  title: string;
  completed: boolean;
  deadline?: string;
  tag?: string;
  important: boolean;
  priority: Priority;
  createdAt?: number;
};

type NewTask = Omit<Task, 'id' | 'completed' | 'createdAt'>;

type TasksContextType = {
  tasks: Task[];
  tags: string[];
  addTask: (task: NewTask) => void;
  toggleTask: (id: string) => void;
  addTag: (tag: string) => void;
};

const PRESET_TAGS = ['Study', 'Chores', 'Admin', 'Personal'];

const TasksContext = createContext<TasksContextType | undefined>(undefined);

export function TasksProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<string[]>(PRESET_TAGS);

  // Live-listen to this user's tasks; reset everything on logout
  useEffect(() => {
    if (!uid) {
      setTasks([]);
      setTags(PRESET_TAGS);
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

 const addTask = (task: NewTask) => {
  if (!uid) return;
  addDoc(collection(db, 'users', uid, 'tasks'), {
    ...task, completed: false, createdAt: Date.now(),
  })
    .then(ref => logEvent(uid, 'task_created', {
      taskId: ref.id, tag: task.tag, priority: task.priority, hasDeadline: !!task.deadline,
    }))
    .catch(e => console.warn('Add task failed', e));
};

const toggleTask = (id: string) => {
  if (!uid) return;
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const nowCompleted = !task.completed;
  updateDoc(doc(db, 'users', uid, 'tasks', id), { completed: nowCompleted })
    .then(() => logEvent(uid, nowCompleted ? 'task_completed' : 'task_uncompleted', { taskId: id }))
    .catch(e => console.warn('Toggle failed', e));
};

  const addTag = (tag: string) => {
    const clean = tag.trim();
    if (!clean || tags.some(t => t.toLowerCase() === clean.toLowerCase())) return;
    setTags(prev => [...prev, clean]);
  };

  return (
    <TasksContext.Provider value={{ tasks, tags, addTask, toggleTask, addTag }}>
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used within TasksProvider');
  return ctx;
}