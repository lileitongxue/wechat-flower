import Taro from '@tarojs/taro';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Network } from '@/network';

/**
 * Supabase 客户端（Taro 适配版）
 * - 配置通过后端 /api/supabase-config 获取（不读 .env）
 * - weapp/tt 环境注入基于 Taro.request 的 fetch polyfill
 * - session 持久化使用 Taro Storage
 */

// 微信/抖音小程序环境没有原生 fetch，注入 polyfill（H5 有原生 fetch）
const taroEnv = Taro.getEnv();
if (
  (taroEnv === 'WEAPP' || taroEnv === 'TT') &&
  typeof (globalThis as any).fetch !== 'function'
) {
  (globalThis as any).fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init?.method || 'GET').toUpperCase();
    const body = init?.body;
    const res = await Network.request({
      url,
      method: method as any,
      data: body,
      header: (init?.headers || {}) as any,
      timeout: 60000,
    });
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      statusText: '',
      headers: new Headers((res.header || {}) as any),
      json: async () => res.data,
      text: async () => (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)),
    } as Response;
  }) as any;
}

// 适配 Taro Storage 的 supabase 存储
const supabaseStorage = {
  getItem: (key: string) => {
    try {
      const v = Taro.getStorageSync(key);
      return v === '' || v == null ? null : String(v);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      Taro.setStorageSync(key, value);
    } catch {
      // ignore quota errors
    }
  },
  removeItem: (key: string) => {
    try {
      Taro.removeStorageSync(key);
    } catch {
      // ignore
    }
  },
};

let client: SupabaseClient | null = null;
let configPromise: Promise<{ url: string; anonKey: string }> | null = null;

async function fetchSupabaseConfig(): Promise<{ url: string; anonKey: string }> {
  if (configPromise) return configPromise;
  configPromise = (async () => {
    const res = await Network.request({ url: '/api/supabase-config' });
    const data = res.data as any;
    if (!data || !data.url || !data.anonKey) {
      throw new Error('获取 Supabase 配置失败');
    }
    return { url: data.url, anonKey: data.anonKey };
  })();
  return configPromise;
}

export async function getSupabaseClientAsync(): Promise<SupabaseClient> {
  if (client) return client;
  const { url, anonKey } = await fetchSupabaseConfig();
  client = createClient(url, anonKey, {
    db: { timeout: 60000 },
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storage: supabaseStorage,
    },
  });
  return client;
}

export async function getSupabaseClientWithRetry(maxRetries = 5, retryInterval = 800): Promise<SupabaseClient> {
  let lastErr: unknown;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await getSupabaseClientAsync();
    } catch (err) {
      lastErr = err;
      if (i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, retryInterval));
      }
    }
  }
  throw lastErr;
}

export { fetchSupabaseConfig };
