import { create } from 'zustand';

const useAppStore = create((set, get) => ({
  // Auth
  user: null,
  authLoading: true,
  setUser: (user) => set({ user }),
  setAuthLoading: (v) => set({ authLoading: v }),

  // App state
  role: 'lead',
  setRole: (role) => set({ role }),

  activeProject: null,
  setActiveProject: (id) => set({ activeProject: id, activeChannel: 'chat', chatTab: 'chat', activeTag: 'all' }),

  activeChannel: 'chat', // chat | ai | echo | pipeline
  setActiveChannel: (ch) => set({ activeChannel: ch }),

  chatTab: 'chat', // chat | kb | tasks
  setChatTab: (tab) => set({ chatTab: tab }),

  activeTag: 'all',
  setActiveTag: (tag) => set({ activeTag: tag }),

  openThreads: new Set(),
  toggleThread: (mid) => set((s) => {
    const n = new Set(s.openThreads);
    if (n.has(mid)) n.delete(mid); else n.add(mid);
    return { openThreads: n };
  }),

  // KB deep-link navigation
  kbDeepLink: null,
  setKbDeepLink: (link) => set({ kbDeepLink: link }),

  // Live meeting navigation (from meeting alert → KB > 회의 tab)
  activeLiveMeetingId: null,
  setActiveLiveMeetingId: (id) => set({ activeLiveMeetingId: id }),

  // Theme
  theme: 'light',
  setTheme: (theme) => set({ theme }),
}));

export default useAppStore;
