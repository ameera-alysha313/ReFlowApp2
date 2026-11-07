import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/auth-context';
import { useMode } from '../context/mode-context';
import { useSchedule } from '../context/schedule-context';
import { logEvent } from '../utils/log-event';
import * as Notifications from 'expo-notifications';

const TEST_MODE = false;

const REAL_OFFSETS_MIN = [0, 120, 240]; // minutes after the user's next wake time
const TEST_OFFSETS_SEC = [20, 40, 60];  // seconds after leaving the app

const MESSAGES = [
  { title: 'ReFlo', body: "Whenever you're ready. Even one tiny thing counts." },
  { title: 'ReFlo', body: 'No pressure. Want to start with something small?' },
  { title: 'ReFlo', body: "A gentle check-in. Tap to open when you're ready." },
];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function nextWake(now: Date, wakeMin: number) {
  const d = new Date(now);
  d.setHours(Math.floor(wakeMin / 60), wakeMin % 60, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

function buildTimes(wakeMin: number, sleepMin: number): Date[] {
  const now = new Date();
  if (TEST_MODE) return TEST_OFFSETS_SEC.map(s => new Date(now.getTime() + s * 1000));
  const awakeMinutes = (sleepMin - wakeMin + 1440) % 1440 || 1440;
  const wake = nextWake(now, wakeMin);
  return REAL_OFFSETS_MIN
    .filter(o => o < awakeMinutes) // never schedule into their sleep time
    .map(o => new Date(wake.getTime() + o * 60000));
}

export default function Reengagement() {
  const { user } = useAuth();
  const { setMode } = useMode();
  const { wakeMin, sleepMin } = useSchedule();
  const uid = user?.uid ?? null;

  // Refs so the AppState listener always sees the latest values
  const setModeRef = useRef(setMode);
  setModeRef.current = setMode;
  const scheduleRef = useRef({ wakeMin, sleepMin });
  scheduleRef.current = { wakeMin, sleepMin };
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!uid) return;
    const key = `ladder:${uid}`;

    const clearPending = async () => {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      const saved = JSON.parse(raw) as { leftAt: number; times: number[]; ids: string[] };
      await Promise.all(saved.ids.map(id => Notifications.cancelScheduledNotificationAsync(id)));
      await AsyncStorage.removeItem(key);
      return saved;
    };

    const onOpen = async () => {
      const saved = await clearPending();
      if (!saved || saved.times.length === 0) return;
      const now = Date.now();
      if (now >= saved.times[saved.times.length - 1]) {
        logEvent(uid, 'recovery_auto_triggered', {
          awayMinutes: Math.round((now - saved.leftAt) / 60000),
          reminders: saved.times.length,
        });
        setModeRef.current('Recovery');
      }
    };

    const onLeave = async () => {
      await clearPending();
      const { wakeMin, sleepMin } = scheduleRef.current;
      const times = buildTimes(wakeMin, sleepMin);
      const ids: string[] = [];
      for (let i = 0; i < times.length; i++) {
        const id = await Notifications.scheduleNotificationAsync({
          content: MESSAGES[i],
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: times[i],
            channelId: 'reminders',
          },
        });
        ids.push(id);
      }
      await AsyncStorage.setItem(
        key,
        JSON.stringify({ leftAt: Date.now(), times: times.map(t => t.getTime()), ids })
      );
    };

    // Run one at a time so quick open/close flips can't interleave
    const run = (fn: () => Promise<void>) => {
      queue.current = queue.current.then(fn).catch(e => console.warn('Reengagement failed', e));
    };

    (async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('reminders', {
          name: 'Gentle reminders',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') await Notifications.requestPermissionsAsync();
    })().catch(() => {});

    run(onOpen); // also covers the app being opened fresh after being closed

    const sub = AppState.addEventListener('change', next => {
      run(next === 'active' ? onOpen : onLeave);
    });
    return () => sub.remove();
  }, [uid]);

  return null;
}