import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import { AppState } from 'react-native';

export type EventType =
  | 'task_created' | 'task_completed' | 'task_uncompleted'
  | 'task_updated' | 'task_deleted'
  | 'task_postponed' | 'task_abandoned'
  | 'mode_switched'
  | 'focus_started' | 'focus_ended' | 'focus_task_switched'
  | 'reflection_note'
  | 'app_state';

export function logEvent(
  uid: string | null,
  type: EventType,
  data: Record<string, unknown> = {}
) {
  if (!uid) return;
  const now = new Date();
  addDoc(collection(db, 'users', uid, 'events'), {
    type,
    ...data,
    createdAt: serverTimestamp(),   // reliable ordering
    clientTime: now.getTime(),
    localHour: now.getHours(),      // "when does this user lock in"
    localDay: now.getDay(),
    tzOffsetMin: now.getTimezoneOffset(),
  }).catch(e => console.warn('Log failed', e));
}