import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import { useAuth } from '../context/auth-context';
import type { EventDoc } from './analytics-summary';

export function useEvents(since: number, until?: number): EventDoc[] {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [events, setEvents] = useState<EventDoc[]>([]);

  useEffect(() => {
    if (!uid) {
      setEvents([]);
      return;
    }
    const col = collection(db, 'users', uid, 'events');
    const q =
      until === undefined
        ? query(col, where('clientTime', '>=', since))
        : query(col, where('clientTime', '>=', since), where('clientTime', '<', until));
    const unsub = onSnapshot(
      q,
      snap => setEvents(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
      err => console.warn('Events listen failed', err)
    );
    return unsub;
  }, [uid, since, until]);

  return events;
}