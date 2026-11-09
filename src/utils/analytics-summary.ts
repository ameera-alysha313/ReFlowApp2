import type { Mode } from '../context/mode-context';

export type EventDoc = {
  id: string;
  type: string;
  clientTime: number;
  [key: string]: any;
};

export const MODES: Mode[] = ['High', 'Medium', 'Low', 'Recovery'];

// Muted traffic-light colours. Letters are always shown too, so colour is never the only signal.
export const MODE_COLORS: Record<Mode, string> = {
  High: '#6DBE7D',
  Medium: '#F2C25B',
  Low: '#E8806F',
  Recovery: '#A94442',
};
export const MODE_TEXT: Record<Mode, string> = {
  High: '#1b1b1b',
  Medium: '#1b1b1b',
  Low: '#1b1b1b',
  Recovery: '#ffffff',
};
export const MODE_LETTER: Record<Mode, string> = { High: 'H', Medium: 'M', Low: 'L', Recovery: 'R' };

// ---- Date helpers (all local time) ----
export function startOfDay(offsetDays = 0): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.getTime();
}

export function addDays(ts: number, n: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

function startOfDayOf(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Sunday of the week containing ts
export function startOfWeek(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

export function formatDuration(totalSeconds: number): string {
  const mins = Math.round(totalSeconds / 60);
  if (mins < 1) return totalSeconds > 0 ? '<1 min' : '0 min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

// ---- Focus, tasks, note ----
export function summarise(events: EventDoc[]) {
  const sorted = [...events].sort((a, b) => a.clientTime - b.clientTime);

  let focusSeconds = 0;
  let sessions = 0;
  const completion = new Map<string, boolean>(); // taskId -> net completed?
  let note: string | null = null;

  for (const e of sorted) {
    switch (e.type) {
      case 'focus_ended':
        focusSeconds += e.focusedSeconds ?? 0;
        sessions += 1;
        break;
      case 'task_completed':
        completion.set(e.taskId, true);
        break;
      case 'task_uncompleted':
        completion.set(e.taskId, false);
        break;
      case 'reflection_note':
        note = e.text ?? null;
        break;
    }
  }

  const completedTaskIds = [...completion.entries()].filter(([, v]) => v).map(([id]) => id);
  return { focusSeconds, sessions, completedTaskIds, note };
}

export function daySummary(events: EventDoc[], dayStart: number) {
  const end = addDays(dayStart, 1);
  return summarise(events.filter(e => e.clientTime >= dayStart && e.clientTime < end));
}

// ---- Mode time per day ----
export type DayModes = Record<Mode, number>;
export const emptyModes = (): DayModes => ({ High: 0, Medium: 0, Low: 0, Recovery: 0 });

const MAX_INTERVAL_MS = 4 * 60 * 60 * 1000; // safety cap if the app was killed without logging

function addInterval(map: Map<number, DayModes>, from: number, to: number, mode: Mode) {
  if (!MODES.includes(mode)) return;
  const end = Math.min(to, from + MAX_INTERVAL_MS);
  let cursor = from;
  while (cursor < end) {
    const dayStart = startOfDayOf(cursor);
    const sliceEnd = Math.min(end, addDays(dayStart, 1)); // split at midnight
    const entry = map.get(dayStart) ?? emptyModes();
    entry[mode] += (sliceEnd - cursor) / 1000;
    map.set(dayStart, entry);
    cursor = sliceEnd;
  }
}

// Only counts time while the app is open (app_state events), in whichever mode was active.
export function modeSecondsByDay(events: EventDoc[], now = Date.now()): Map<number, DayModes> {
  const sorted = [...events].sort((a, b) => a.clientTime - b.clientTime);
  const map = new Map<number, DayModes>();
  let active = false;
  let mode: Mode | null = null;
  let since = 0;

  const close = (at: number) => {
    if (active && mode) addInterval(map, since, at, mode);
  };

  for (const e of sorted) {
    if (e.type === 'app_state') {
      if (e.state === 'active') {
        if (!active) {
          active = true;
          mode = e.mode as Mode;
          since = e.clientTime;
        }
      } else {
        close(e.clientTime);
        active = false;
      }
    } else if (e.type === 'mode_switched' && active) {
      close(e.clientTime);
      mode = e.to as Mode;
      since = e.clientTime;
    }
  }
  if (active) close(now);
  return map;
}

// The mode a day was "mostly" in (needs at least a minute of data)
export function dominantMode(modes?: DayModes): Mode | null {
  if (!modes) return null;
  const total = MODES.reduce((s, m) => s + modes[m], 0);
  if (total < 60) return null;
  return MODES.reduce((best, m) => (modes[m] > modes[best] ? m : best), MODES[0]);
}

// ---- Time-of-day chart ----
export function hourCounts(events: EventDoc[], type: string): number[] {
  const counts: number[] = new Array(24).fill(0);
  for (const e of events) {
    if (e.type === type && typeof e.localHour === 'number') counts[e.localHour] += 1;
  }
  return counts;
}

// Only tasks that are *currently* completed, so undone accidental ticks don't count.
// Ticks made from a check-in (they have a `source`) are ignored, since they're done earlier.
export function completedHourCounts(events: EventDoc[]): number[] {
  const counts: number[] = new Array(24).fill(0);
  const latest = new Map<string, EventDoc>();
  const sorted = [...events].sort((a, b) => a.clientTime - b.clientTime);
  for (const e of sorted) {
    if (e.type === 'task_completed' || e.type === 'task_uncompleted') latest.set(e.taskId, e);
  }
  latest.forEach(e => {
    if (e.type === 'task_completed' && !e.source && typeof e.localHour === 'number') counts[e.localHour] += 1;
  });
  return counts;
}

// Seconds focused, grouped by the hour the session *started*
export function focusSecondsByStartHour(events: EventDoc[]): number[] {
  const out: number[] = new Array(24).fill(0);
  const startHour = new Map<string, number>();
  for (const e of events) {
    if (e.type === 'focus_started' && typeof e.localHour === 'number') startHour.set(e.sessionId, e.localHour);
  }
  for (const e of events) {
    if (e.type !== 'focus_ended') continue;
    const h = startHour.get(e.sessionId) ?? e.localHour;
    if (typeof h === 'number') out[h] += e.focusedSeconds ?? 0;
  }
  return out;
}