import { View, Text, Image } from '@tarojs/components';
import { Button } from '@/components/ui/button';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { Api, Order } from '@/api';
import { useAuthStore } from '@/store/auth';

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待支付', color: 'text-orange-500' },
  paid: { label: '待发货', color: 'text-blue-500' },
  delivering: { label: '配送中', color: 'text-blue-500' },
  completed: { label: '已完成', color: 'text-green-500' },
  cancelled: { label: '已取消', color: 'text-gray-400' },
};

const OrderPage = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useLoad(async () => {
    const user = useAuthStore.getState().user;
    if (!user) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => {
        Taro.navigateTo({ url: '/pages/login/index?redirect=/pages/order/index' });
      }, 500);
      return;
    }
    try {
      const list = await Api.getOrders();
      setOrders(list || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  });

  return (
    <View className="min-h-screen bg-gray-50 px-3 pt-3 pb-6">
      {loading ? (
        <View className="py-10 text-center">
          <Text className="text-gray-400 text-sm">加载中...</Text>
        </View>
      ) : orders.length === 0 ? (
        <View className="py-16 text-center">
          <Text className="text-4xl mb-3 block">📦</Text>
          <Text className="text-gray-400 mb-4">还没有订单</Text>
          <Button
            className="!bg-rose-500 !text-white !rounded-full text-sm px-6"
            onClick={() => Taro.switchTab({ url: '/pages/index/index' })}
          >
            去逛逛
          </Button>
        </View>
      ) : (
        (orders || []).map((o) => (
          <View key={o.id} className="bg-white rounded-xl p-3 mb-3">
            <View className="flex justify-between items-center mb-2">
              <Text className="text-xs text-gray-400">订单号：{o.order_no}</Text>
              <Text className={`text-sm font-medium ${statusMap[o.status]?.color || 'text-gray-500'}`}>
                {statusMap[o.status]?.label || o.status}
              </Text>
            </View>
            {(o.order_items || []).map((it, idx) => (
              <View key={`${o.id}-${idx}`} className="flex items-center gap-3 py-2">
                <Image className="w-12 h-12 rounded-lg" src={it.product_image || ''} mode="aspectFill" />
                <View className="flex-1 min-w-0">
                  <Text className="block text-sm truncate">{it.product_name}</Text>
                  <Text className="text-xs text-gray-400">¥{it.price} x {it.quantity}</Text>
                </View>
                <Text className="text-sm text-gray-700">¥{(Number(it.price) * it.quantity).toFixed(2)}</Text>
              </View>
            ))}
            <View className="border-t border-gray-100 mt-2 pt-2 flex items-center justify-between">
              <Text className="text-xs text-gray-400">
                {o.delivery_type === 'delivery' ? '同城配送' : '门店自提'}
              </Text>
              <View className="flex items-baseline gap-1">
                <Text className="text-xs text-gray-400">
                  {o.discount_amount && Number(o.discount_amount) > 0 ? `已优惠¥${o.discount_amount} ` : ''}实付
                </Text>
                <Text className="text-rose-600 font-bold">¥{o.pay_amount}</Text>
              </View>
            </View>
          </View>
        ))
      )}
    </View>
  );
};

export default OrderPage;
