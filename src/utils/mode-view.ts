import type { Task, Priority } from '../context/task-context';
import type { Mode } from '../context/mode-context';

// Medium mode: how many days ahead counts as "due soon"
export const MEDIUM_WINDOW_DAYS = 5;

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

// Whole days from today until the deadline (negative = overdue).
// Returns null if there's no deadline or it can't be read.
export function daysUntil(deadline?: string): number | null {
  if (!deadline) return null;
  const match = deadline.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const due = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(deadline);
  if (isNaN(due.getTime())) return null;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86400000);
}

export function deadlineLabel(deadline?: string): string | null {
  const days = daysUntil(deadline);
  if (days === null) return null;
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

// Nearest deadline first, then by priority
const byUrgency = (a: Task, b: Task) => {
  const da = daysUntil(a.deadline) ?? Infinity;
  const db = daysUntil(b.deadline) ?? Infinity;
  if (da !== db) return da - db;
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
};


// Highest priority first, then nearest deadline
const byPriority = (a: Task, b: Task) =>
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || byUrgency(a, b);
  const isToday = (ts?: number) => !!ts && new Date(ts).toDateString() === new Date().toDateString();
  
  export const getDoneToday = (tasks: Task[]) =>
    tasks.filter(t => t.completed && isToday(t.completedAt));

  export type ModeView =
  | { kind: 'empty'; allDone: boolean }
  | { kind: 'all'; tasks: Task[]}
  | { kind: 'due-soon'; tasks: Task[] }
  | { kind: 'single'; task: Task }
  | { kind: 'nothing-urgent'; available: Task[] }
  | { kind: 'recovery' };  

export function getModeView(tasks: Task[], mode: Mode): ModeView {
  if (mode === 'Recovery') return { kind: 'recovery' };
  if (tasks.length === 0) return { kind: 'empty', allDone: false };

  tasks = tasks.filter(t => !t.habitId);

  // High: everything, open tasks first by priority, completed at the bottom
  if (mode === 'High') {
  const open = tasks.filter(t => !t.completed).sort(byPriority);
  if (open.length === 0) return { kind: 'empty', allDone: true };
  return { kind: 'all', tasks: open };
  }

  const open = tasks.filter(t => !t.completed);
  if (open.length === 0) return { kind: 'empty', allDone: true };

  // Medium: tasks due within the window (or overdue), nearest first
  if (mode === 'Medium') {
    const dueSoon = open
      .filter(t => {
        const d = daysUntil(t.deadline);
        return d !== null && d <= MEDIUM_WINDOW_DAYS;
      })
      .sort(byUrgency);
    if (dueSoon.length > 0) return { kind: 'due-soon', tasks: dueSoon };
    return { kind: 'nothing-urgent', available: open.sort(byPriority) };
  }

  // Low: one task due today or overdue.
  // Stand-in for "simplest task": the earliest deadline. Swap for the friction score later.
  const dueToday = open
    .filter(t => {
      const d = daysUntil(t.deadline);
      return d !== null && d <= 0;
    })
    .sort(byUrgency);
  if (dueToday.length > 0) return { kind: 'single', task: dueToday[0] };
  return { kind: 'nothing-urgent', available: open.sort(byPriority) };
}