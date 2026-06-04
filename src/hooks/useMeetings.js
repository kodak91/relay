import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy, Timestamp, arrayUnion, deleteField } from 'firebase/firestore';
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

  // Start live session — resets transcript, sets liveStartedAt, adds first presence entry
  const startLiveMeeting = (meetingId, user) =>
    updateDoc(doc(db, 'projects', projectId, 'meetings', meetingId), {
      status: 'live',
      liveTranscript: [],
      liveStartedAt: serverTimestamp(),
      [`livePresence.${user.uid}`]: { name: user.name, joinedAt: new Date().toISOString() },
    });

  // Join an already-live session — only adds presence
  const joinLiveMeeting = (meetingId, user) =>
    updateDoc(doc(db, 'projects', projectId, 'meetings', meetingId), {
      [`livePresence.${user.uid}`]: { name: user.name, joinedAt: new Date().toISOString() },
    });

  // Append a single transcript line
  const addLiveLine = (meetingId, line) =>
    updateDoc(doc(db, 'projects', projectId, 'meetings', meetingId), {
      liveTranscript: arrayUnion(line),
    });

  // Remove a user's presence entry on exit
  const removeLivePresence = (meetingId, uid) =>
    updateDoc(doc(db, 'projects', projectId, 'meetings', meetingId), {
      [`livePresence.${uid}`]: deleteField(),
    });

  // Mark meeting as notified so the alert is only sent once
  const markNotified = (meetingId) =>
    updateDoc(doc(db, 'projects', projectId, 'meetings', meetingId), { notified: true });

  return { meetings, addMeeting, updateMeeting, deleteMeeting, startLiveMeeting, joinLiveMeeting, addLiveLine, removeLivePresence, markNotified };
}
