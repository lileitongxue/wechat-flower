import Taro from '@tarojs/taro';
import { create } from 'zustand';

export interface CartItem {
  product_id: number;
  name: string;
  price: number;
  image_url: string;
  stock: number;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  load: () => void;
  add: (item: CartItem) => void;
  remove: (product_id: number) => void;
  updateQuantity: (product_id: number, quantity: number) => void;
  clear: () => void;
  totalCount: () => number;
  totalAmount: () => number;
}

const CART_KEY = 'flower_cart';

function persist(items: CartItem[]) {
  Taro.setStorageSync(CART_KEY, items);
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  load: () => {
    try {
      const saved = Taro.getStorageSync(CART_KEY);
      if (Array.isArray(saved)) {
        set({ items: saved as CartItem[] });
      }
    } catch {
      // ignore
    }
  },

  add: (item) => {
    const items = [...get().items];
    const idx = items.findIndex((i) => i.product_id === item.product_id);
    if (idx >= 0) {
      items[idx].quantity = Math.min(items[idx].quantity + item.quantity, item.stock);
    } else {
      items.push({ ...item, quantity: Math.min(item.quantity, item.stock) });
    }
    set({ items });
    persist(items);
  },

  remove: (product_id) => {
    const items = get().items.filter((i) => i.product_id !== product_id);
    set({ items });
    persist(items);
  },

  updateQuantity: (product_id, quantity) => {
    const items = get().items.map((i) =>
      i.product_id === product_id
        ? { ...i, quantity: Math.max(1, Math.min(quantity, i.stock)) }
        : i
    );
    set({ items });
    persist(items);
  },

  clear: () => {
    set({ items: [] });
    Taro.removeStorageSync(CART_KEY);
  },

  totalCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

  totalAmount: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
}));
