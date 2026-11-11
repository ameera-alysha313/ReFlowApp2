import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export type FocusLive = {
  phase: 'idle' | 'focus' | 'break' | 'ready';
  kind: 'timer' | 'stopwatch';
  secondsLeft: number;     // timer: time left in the session
  focusedSeconds: number;  // focus time since the last break
  breakBanked: boolean;    // a break is already unlocked
  earnSeconds: number;     // focus needed to unlock the next break
  breakLeft: number;
  graceLeft: number;
  graceSeconds: number;
  taskTitle?: string;
};

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// Everything this feature sends is tagged data.kind = 'focus', so the daily reminders never touch it
async function cancelFocusNotifications() {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    pending
      .filter(n => (n.content.data as { kind?: string } | undefined)?.kind === 'focus')
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {}))
  );
  const shown = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(
    shown
      .filter(n => (n.request.content.data as { kind?: string } | undefined)?.kind === 'focus')
      .map(n => Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {}))
  );
}

async function scheduleFocusNotifications(s: FocusLive) {
  if (s.phase === 'idle') return;
  await cancelFocusNotifications();

  const now = Date.now();
  const onTask = s.taskTitle ? ` on ${s.taskTitle}` : '';
  const jobs: Promise<unknown>[] = [];

  // A quiet "still running" note, so the session is never out of sight
  const status = (title: string, body: string) =>
    jobs.push(
      Notifications.scheduleNotificationAsync({
        content: { title, body, data: { kind: 'focus' } },
        trigger: (Platform.OS === 'android' ? { channelId: 'focus-status' } : null) as any,
      }).catch(e => console.warn('Focus status failed', e))
    );

  // An alert at a moment that matters
  const alertIn = (afterSec: number, title: string, body: string) =>
    jobs.push(
      Notifications.scheduleNotificationAsync({
        content: { title, body, data: { kind: 'focus' } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(now + Math.max(afterSec, 2) * 1000),
          channelId: 'focus',
        },
      }).catch(e => console.warn('Focus alert failed', e))
    );

  if (s.phase === 'focus') {
    status(
      'Focus session running',
      s.kind === 'timer'
        ? `${s.taskTitle ?? 'Focusing'} · ends around ${clock(now + s.secondsLeft * 1000)}`
        : `${s.taskTitle ?? 'Focusing'} · stopwatch running`
    );
    if (!s.breakBanked) {
      const need = s.earnSeconds - s.focusedSeconds;
      if (need > 0 && (s.kind === 'stopwatch' || need < s.secondsLeft)) {
        alertIn(need, 'Break unlocked', `You've focused long enough${onTask}. Take a break whenever you're ready.`);
      }
    }
    if (s.kind === 'timer') alertIn(s.secondsLeft, 'Session complete', `Nice work${onTask}. Tap to wrap up.`);
  } else if (s.phase === 'break') {
    status('On a break', `Back at about ${clock(now + s.breakLeft * 1000)}`);
    alertIn(
      s.breakLeft,
      "Break's over",
      `Ready to get back to it? You have ${Math.max(1, Math.round(s.graceSeconds / 60))} minutes before the session ends.`
    );
    alertIn(s.breakLeft + s.graceSeconds - 30, '30 seconds left', 'Tap to resume your session before it ends.');
  } else if (s.phase === 'ready') {
    status("Break's over", 'Tap to resume your session.');
    if (s.graceLeft > 8) {
      alertIn(s.graceLeft - 30, `${Math.min(30, s.graceLeft)} seconds left`, 'Tap to resume your session before it ends.');
    }
  }
  await Promise.all(jobs);
}

// Keeps a running focus session visible when the user leaves the app:
// a quiet status note, plus alerts for "break unlocked", "session complete",
// "break's over" and "30 seconds left to resume". Cleared as soon as the user comes back.
export function useFocusNotifications(state: FocusLive) {
  const live = useRef(state);
  live.current = state;

  useEffect(() => {
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('focus', {
        name: 'Focus session alerts',
        importance: Notifications.AndroidImportance.HIGH,
      }).catch(() => {});
      Notifications.setNotificationChannelAsync('focus-status', {
        name: 'Focus session status',
        importance: Notifications.AndroidImportance.LOW,
      }).catch(() => {});
    }
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') cancelFocusNotifications().catch(() => {});
      else scheduleFocusNotifications(live.current).catch(e => console.warn('Focus notifications failed', e));
    });
    return () => sub.remove();
  }, []);
}