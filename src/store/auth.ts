import Taro from '@tarojs/taro';
import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { getSupabaseClientWithRetry } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  initialized: boolean;
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  initialized: false,

  init: async () => {
    try {
      const supabase = await getSupabaseClientWithRetry();
      const { data } = await supabase.auth.getSession();
      set({ session: data.session, user: data.session?.user ?? null, initialized: true });
    } catch (err) {
      console.error('Auth init failed', err);
      set({ initialized: true });
    }
  },

  signIn: async (email, password) => {
    const supabase = await getSupabaseClientWithRetry();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    // 同步更新 session，避免路由守卫误判未登录
    set({ session: data.session, user: data.session?.user ?? null, initialized: true });
  },

  signUp: async (email, password) => {
    const supabase = await getSupabaseClientWithRetry();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    if (data.session) {
      // mailer_autoconfirm=true 时注册即登录
      set({ session: data.session, user: data.session.user ?? null, initialized: true });
    }
  },

  signOut: async () => {
    const supabase = await getSupabaseClientWithRetry();
    await supabase.auth.signOut();
    set({ session: null, user: null, initialized: true });
    Taro.removeStorageSync('cart');
  },
}));

export function useAuthToken(): string | null {
  return useAuthStore.getState().session?.access_token ?? null;
}
