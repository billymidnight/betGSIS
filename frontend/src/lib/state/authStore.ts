// Auth store using Zustand
import { create } from 'zustand';
import supabase from '../supabaseClient';

export interface User {
  user_id: string;
  screen_name?: string;
  email?: string;
  // optional fields kept for compatibility with other modules
  username?: string;
  role?: string;
}

interface AuthStore {
  isAuthenticated: boolean;
  user: User | null;
  accessToken?: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<any>;
  init: () => Promise<void>;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  isAuthenticated: false,
  user: null,
  accessToken: null,
  setUser: (user: User | null) => set({ user, isAuthenticated: !!user }),
  setToken: (token: string | null) => set({ accessToken: token }),
  login: async (email: string, password: string) => {
    try {
      const res = await supabase.auth.signInWithPassword({ email, password } as any);
      const session = (res as any)?.data?.session;
      if (session) {
        const token = session.access_token;
        set({ accessToken: token });
        // trigger init to populate full user info
        try {
          // call init via the store's getter (typed)
          const state = get();
          if (state && typeof state.init === 'function') await state.init();
        } catch (e) {
          // ignore
        }
      } else {
        set({ user: { user_id: (res as any)?.data?.user?.id ?? email, email }, isAuthenticated: true });
      }
    } catch (err) {
      console.error('login error', err);
      throw err;
    }
  },
  signup: async (email: string, password: string) => {
    try {
      const res = await supabase.auth.signUp({ email, password } as any);
      const session = (res as any)?.data?.session ?? (res as any)?.data?.user ?? null;
      // If session exists, extract access token
      const token = session?.access_token ?? null;
      if (token) {
        set({ accessToken: token });
      }

      // Notify backend to create custom users row (idempotent). Use admin path that reads Authorization bearer token.
      try {
        const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
        if (token) {
          await fetch(`${apiBase}/api/auth/create_user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ email }),
          });
        }
      } catch (err) {
        if (import.meta.env.DEV) console.warn('create_user call failed', err);
      }

      // After signup, call init() to refresh user state
      try {
        const state = get();
        if (state && typeof state.init === 'function') await state.init();
      } catch (e) {
        // ignore
      }

      return res;
    } catch (err) {
      console.error('signup error', err);
      throw err;
    }
  },
  init: async () => {
    try {
      const sessRes = await supabase.auth.getSession();
      const session = (sessRes as any)?.data?.session;
      if (!session) {
        set({ user: null, isAuthenticated: false });
        return;
      }

      const token = session.access_token;
      // persist token to store so other modules can read it
      set({ accessToken: token });

      // subscribe to auth state changes so token stays current (helps magic-link flows)
      try {
        const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
          const newToken = (s as any)?.access_token ?? (s as any)?.session?.access_token ?? null;
          if (import.meta.env.DEV) console.log('onAuthStateChange', event, !!newToken);
          set({ accessToken: newToken });
          // if we have a token and a user, try to fetch user info from backend
          if (newToken && (s as any)?.user) {
            (async () => {
              try {
                const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
                const res2 = await fetch(`${apiBase}/api/auth/me`, { headers: { Authorization: `Bearer ${newToken}` } });
                const raw2 = await res2.text();
                try {
                  const d2 = JSON.parse(raw2);
                  const userObj2 = d2?.user ?? d2;
                  if (userObj2 && (userObj2.user_id || userObj2.id)) {
                    set({ user: { user_id: userObj2.user_id ?? userObj2.id, screen_name: userObj2.screen_name, email: (s as any)?.user?.email }, isAuthenticated: true });
                  }
                } catch (err) {
                  if (import.meta.env.DEV) console.warn('onAuthStateChange /api/auth/me returned non-json');
                }
              } catch (err) {
                if (import.meta.env.DEV) console.warn('onAuthStateChange fetch /api/auth/me failed', err);
              }
            })();
          }
        });
        // no need to keep reference here; subscription will live for app lifecycle in dev
      } catch (e) {
        if (import.meta.env.DEV) console.warn('onAuthStateChange subscription failed', e);
      }

      
      // Call backend to fetch user's screen_name
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    const reqUrl = `${apiBase}/api/auth/me`;
    if (import.meta.env.DEV) console.log('authStore: fetching', reqUrl);
    const res = await fetch(reqUrl, { headers: { Authorization: `Bearer ${token}` } });
      // Read as text first in case the server returns HTML (e.g., a redirect to an HTML page)
      const raw = await res.text();
      if (import.meta.env.DEV) console.log('/api/auth/me raw response (truncated):', raw?.slice?.(0, 200));

      try {
        const data = JSON.parse(raw);
        const userObj = data?.user ?? data;
        if (userObj && (userObj.user_id || userObj.id)) {
          set({ user: { user_id: userObj.user_id ?? userObj.id, screen_name: userObj.screen_name, email: session.user?.email, username: userObj.screenname, role: userObj.role }, isAuthenticated: true });
        } else {
          console.warn('/api/auth/me returned JSON but no user information found:', data);
          set({ user: { user_id: session.user?.id, email: session.user?.email }, isAuthenticated: true });
        }
      } catch (jsonErr) {
        console.error('authStore.init: /api/auth/me response is not valid JSON (likely HTML). Raw response below:');
        console.error(raw);
        set({ user: { user_id: session.user?.id, email: session.user?.email }, isAuthenticated: true });
      }
    } catch (e) {
      console.error('authStore.init unexpected error', e);
      set({ user: null, isAuthenticated: false });
    }
  },
  logout: async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('logout error', err);
    }
    set({ user: null, isAuthenticated: false });
  },
}));


