import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import { AppState } from 'react-native';

export type EventType =
  | 'onboarding_completed'
  |'task_created' | 'task_completed' | 'task_uncompleted'
  | 'task_updated' | 'task_deleted'
  | 'task_postponed' | 'task_abandoned'
  | 'task_rated'
  | 'task_broken_down'
  | 'task_steps_edited'
  | 'recommendation_shown' | 'recommendation_accepted'
  | 'mode_switched'
  | 'schedule_set'
  | 'focus_started' | 'focus_ended' | 'focus_task_switched'
  | 'reminders_scheduled' | 'reminder_opened'
  | 'recovery_action_done' | 'recovery_action_skipped'
  | 'recovery_step_up' | 'recovery_step_up_dismissed'
  | 'task_passed_over'
  | 'reflection_note'
  | 'app_state'
  | 'recovery_auto_triggered'
  | 'eod_checkin_done' | 'habit_created' | 'habit_deleted' | 'habit_updated' | 'onboarding_completed';
  

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