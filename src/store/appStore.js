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

  // 검색 등에서 아직 로드되지 않은(페이지네이션 창 밖의) 채팅 메시지로 이동
  // 요청이 오면, ChatMain이 이 메시지를 보고 그 주변만 슬랙식으로 따로
  // 불러와서 보여준다. { id, createdAt, ... } 형태의 메시지 객체.
  pendingJumpTarget: null,
  setPendingJumpTarget: (msg) => set({ pendingJumpTarget: msg }),

  // Live meeting navigation (from meeting alert → KB > 회의 tab)
  activeLiveMeetingId: null,
  setActiveLiveMeetingId: (id) => set({ activeLiveMeetingId: id }),

  // Theme
  theme: 'light',
  setTheme: (theme) => set({ theme }),
}));

export default useAppStore;
