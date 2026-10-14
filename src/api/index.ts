import Taro from '@tarojs/taro';
import { Network } from '@/network';
import { useAuthStore } from '@/store/auth';

/**
 * 业务 API 层
 * - 统一前缀 /api
 * - 自动附加 x-session 鉴权 header
 * - 401 → 跳登录页；业务错误（400 + message）→ 抛 Error
 */
export interface ApiResponse<T = unknown> {
  status: string;
  data?: T;
  message?: string;
  pagination?: { page: number; page_size: number; total: number };
}

export interface Category {
  id: number;
  name: string;
  icon?: string;
  sort_order?: number;
}

export interface Product {
  id: number;
  category_id?: number;
  name: string;
  description?: string;
  price: number;
  original_price?: number;
  image_url?: string;
  images?: string[];
  stock: number;
  sales: number;
  status: string;
  is_featured?: boolean;
  tags?: string[];
}

export interface OrderItem {
  product_name: string;
  product_image?: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  order_no: string;
  total_amount: number;
  discount_amount: number;
  pay_amount: number;
  delivery_type: 'delivery' | 'pickup';
  status: string;
  created_at: string;
  receiver_name?: string;
  receiver_phone?: string;
  receiver_address?: string;
  pickup_time?: string;
  remark?: string;
  order_items?: OrderItem[];
}

export interface Appointment {
  id: string;
  type: string;
  title: string;
  description?: string;
  appointment_date?: string;
  budget?: number;
  contact_name?: string;
  contact_phone?: string;
  status: string;
  created_at: string;
}

export interface Profile {
  user_id: string;
  nickname?: string;
  avatar_url?: string;
  phone?: string;
  points: number;
  level: string;
}

export interface Coupon {
  id: number;
  name: string;
  type: string;
  value: number;
  min_amount: number;
  total_count?: number;
  claimed_count?: number;
  end_date?: string;
}

export interface MyCoupon {
  id: number;
  status: string;
  claimed_at: string;
  used_at?: string;
  coupons: Coupon;
}

async function request<T = unknown>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  data?: unknown
): Promise<T> {
  const token = useAuthStore.getState().session?.access_token;
  const header: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    header['x-session'] = token;
  }

  const res = await Network.request({
    url: `/api${path}`,
    method,
    data,
    header,
  });

  if (res.statusCode === 401) {
    const pages = Taro.getCurrentPages();
    const current = pages[pages.length - 1]?.route || '';
    if (!current.includes('login')) {
      Taro.navigateTo({ url: '/pages/login/index?redirect=' + encodeURIComponent(current) });
    }
    throw new Error('请先登录');
  }

  const body = (res.data || {}) as ApiResponse<T>;
  if (body && body.status === 'error') {
    throw new Error(body.message || '请求失败');
  }
  if (res.statusCode >= 400) {
    throw new Error((body as any)?.message || '请求失败');
  }
  return body.data as T;
}

export namespace Api {
  export const getCategories = () => request<Category[]>('GET', '/categories');

  export const getProducts = (params?: Record<string, unknown>) => {
    const qs = params
      ? '?' +
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    return request<Product[]>('GET', `/products${qs}`);
  };

  export const getProduct = (id: number) => request<Product>('GET', `/products/${id}`);

  export const createOrder = (payload: {
    items: { product_id: number; quantity: number }[];
    delivery_type: 'delivery' | 'pickup';
    receiver_name?: string;
    receiver_phone?: string;
    receiver_address?: string;
    pickup_time?: string;
    remark?: string;
    user_coupon_id?: number;
  }) =>
    request<{ order_id: string; order_no: string; pay_amount: number; status: string }>(
      'POST',
      '/orders',
      payload
    );

  export const getOrders = () => request<Order[]>('GET', '/orders');

  export const getOrder = (id: string) => request<Order>('GET', `/orders/${id}`);

  export const getAppointments = () => request<Appointment[]>('GET', '/appointments');

  export const createAppointment = (payload: {
    type: string;
    title: string;
    description?: string;
    appointment_date?: string;
    budget?: number;
    contact_name?: string;
    contact_phone?: string;
  }) => request<Appointment>('POST', '/appointments', payload);

  export const getProfile = () => request<Profile>('GET', '/profile');

  export const updateProfile = (payload: { nickname?: string; phone?: string; avatar_url?: string }) =>
    request<Profile>('PUT', '/profile', payload);

  export const getCoupons = () => request<Coupon[]>('GET', '/coupons');

  export const claimCoupon = (id: number) => request<unknown>('POST', `/coupons/${id}/claim`);

  export const getMyCoupons = () => request<MyCoupon[]>('GET', '/coupons/my');
}
