import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/auth-context';
import { logEvent } from '../utils/log-event';

const SLIDES = [
  {
    title: 'Welcome to ReFlo!',
    body: "ReFlo changes what it shows you depending on how you're feeling. There's no score and no pressure. This takes about a minute.",
  },
  {
    title: 'Pick a mode',
    body: "On the Mode tab, choose High, Medium or Low for how you feel today. Lower modes show fewer tasks. If you've been away a while, ReFlo may switch to Recovery mode, which offers tiny, gentle steps.",
  },
  {
    title: 'Add tasks',
    body: "Tap the + button on Home. Give a task a deadline and a tag if you like. Press and hold a task to edit or delete it. Open a task and tap 'Break it into small steps' if it feels too big.",
  },
  {
    title: 'Focus sessions',
    body: "On the Focus tab, pick a task and start a timer or stopwatch. After a stretch of focus you earn a short break. If you're away too long after a break, the session simply ends. No penalty.",
  },
  {
    title: 'Habits and check-ins',
    body: "In Settings you can set your waking hours, add your own tags and create recurring habits. Near bedtime, a quick check-in lets you mark tasks done, move them to tomorrow, or drop them.",
  },
  {
    title: 'See your progress',
    body: "The Analytics tab shows your focus time, finished tasks and a mood calendar, so you can spot what works for you. You're ready to start.",
  },
];

export default function Onboarding() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [ready, setReady] = useState(false);
  const [seen, setSeen] = useState(true);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setReady(false);
    setIndex(0);
    if (!uid) return;
    AsyncStorage.getItem(`onboarded:${uid}`)
      .then(v => setSeen(v === '1'))
      .catch(() => setSeen(true)) // if storage fails, don't trap the user
      .finally(() => setReady(true));
  }, [uid]);

  if (!uid || !ready || seen) return null;

  const last = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  const finish = () => {
    AsyncStorage.setItem(`onboarded:${uid}`, '1').catch(() => {});
    logEvent(uid, 'onboarding_completed', { slides: SLIDES.length });
    setSeen(true);
  };

  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.step}>{index + 1} of {SLIDES.length}</Text>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Pressable style={[styles.button, styles.primary]} onPress={() => (last ? finish() : setIndex(index + 1))}>
          <Text style={styles.primaryText}>{last ? 'Get started' : 'Next'}</Text>
        </Pressable>
        {index > 0 && (
          <Pressable onPress={() => setIndex(index - 1)} hitSlop={12}>
            <Text style={styles.back}>Back</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: '#f5f5f5' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 30, paddingTop: 80 },
  step: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 12 },
  title: { fontSize: 30, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
  body: { fontSize: 18, lineHeight: 27, color: '#333', textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ccc' },
  dotActive: { backgroundColor: '#4A90D9' },
  footer: { padding: 30, paddingBottom: 50, alignItems: 'center' },
  button: { width: '100%', paddingVertical: 14, borderRadius: 28, alignItems: 'center' },
  primary: { backgroundColor: '#4A90D9' },
  primaryText: { color: 'white', fontSize: 16, fontWeight: '600' },
  back: { color: '#4A90D9', fontSize: 15, marginTop: 18 },
});
