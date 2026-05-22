import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useMeetings(projectId) {
  const [meetings, setMeetings] = useState([]);

  useEffect(() => {
    if (!projectId) return;
    const q = query(collection(db, 'projects', projectId, 'meetings'), orderBy('createdAt'));
    return onSnapshot(q, (snap) => {
      setMeetings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [projectId]);

  const addMeeting = ({ title, agenda, scheduledAt, participants, createdBy }) =>
    addDoc(collection(db, 'projects', projectId, 'meetings'), {
      title,
      agenda: agenda.filter((a) => a.trim()),
      scheduledAt: scheduledAt ? Timestamp.fromDate(new Date(scheduledAt)) : null,
      participants,
      createdBy,
      status: 'scheduled',
      createdAt: serverTimestamp(),
    });

  const updateMeeting = (meetingId, data) =>
    updateDoc(doc(db, 'projects', projectId, 'meetings', meetingId), data);

  const deleteMeeting = (meetingId) =>
    deleteDoc(doc(db, 'projects', projectId, 'meetings', meetingId));

  return { meetings, addMeeting, updateMeeting, deleteMeeting };
}
