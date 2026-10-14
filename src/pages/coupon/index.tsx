import { View, Text } from '@tarojs/components';
import { Button } from '@/components/ui/button';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { Api, Coupon, MyCoupon } from '@/api';
import { useAuthStore } from '@/store/auth';

const CouponPage = () => {
  const [tab, setTab] = useState<'available' | 'mine'>('available');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [myCoupons, setMyCoupons] = useState<MyCoupon[]>([]);

  useLoad(async () => {
    try {
      const list = await Api.getCoupons();
      setCoupons(list || []);
    } catch (err) {
      console.error(err);
    }
    const user = useAuthStore.getState().user;
    if (user) {
      try {
        const my = await Api.getMyCoupons();
        setMyCoupons(my || []);
      } catch (err) {
        console.error(err);
      }
    }
  });

  const claim = async (id: number) => {
    const user = useAuthStore.getState().user;
    if (!user) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => {
        Taro.navigateTo({ url: '/pages/login/index?redirect=/pages/coupon/index' });
      }, 500);
      return;
    }
    try {
      await Api.claimCoupon(id);
      Taro.showToast({ title: '领取成功', icon: 'success' });
      const my = await Api.getMyCoupons();
      setMyCoupons(my || []);
    } catch (err) {
      Taro.showToast({ title: err.message || '领取失败', icon: 'none' });
    }
  };

  return (
    <View className="min-h-screen bg-gray-50">
      {/* tab */}
      <View className="flex bg-white border-b border-gray-100">
        <View
          className={`flex-1 text-center py-3 text-sm ${tab === 'available' ? 'text-rose-500 font-medium border-b-2 border-rose-500' : 'text-gray-500'}`}
          onClick={() => setTab('available')}
        >
          领券中心
        </View>
        <View
          className={`flex-1 text-center py-3 text-sm ${tab === 'mine' ? 'text-rose-500 font-medium border-b-2 border-rose-500' : 'text-gray-500'}`}
          onClick={() => setTab('mine')}
        >
          我的优惠券
        </View>
      </View>

      {tab === 'available' ? (
        <View className="px-4 pt-4">
          {(coupons || []).map((c) => (
            <View key={c.id} className="bg-white rounded-xl p-4 mb-3 flex items-center">
              <View className="w-16 text-center">
                <Text className="text-rose-600 text-lg font-bold">¥{c.value}</Text>
                <Text className="block text-[10px] text-gray-400">满{c.min_amount}可用</Text>
              </View>
              <View className="flex-1 px-3">
                <Text className="block text-sm font-medium">{c.name}</Text>
                <Text className="block text-xs text-gray-400 mt-1">有效期至 {c.end_date || '长期有效'}</Text>
              </View>
              <Button
                className="!bg-rose-50 !text-rose-500 !text-xs !rounded-full !border-0 px-4"
                onClick={() => claim(c.id)}
              >
                领取
              </Button>
            </View>
          ))}
          {coupons.length === 0 && (
            <View className="py-16 text-center">
              <Text className="text-gray-400 text-sm">暂无可用优惠券</Text>
            </View>
          )}
        </View>
      ) : (
        <View className="px-4 pt-4">
          {(myCoupons || []).map((c) => (
            <View key={c.id} className="bg-white rounded-xl p-4 mb-3 flex items-center">
              <View className="w-16 text-center">
                <Text className="text-rose-600 text-lg font-bold">¥{c.coupons?.value}</Text>
                <Text className="block text-[10px] text-gray-400">满{c.coupons?.min_amount}可用</Text>
              </View>
              <View className="flex-1 px-3">
                <Text className="block text-sm font-medium">{c.coupons?.name}</Text>
                <Text className="block text-xs text-gray-400 mt-1">
                  {c.status === 'used' ? '已使用' : c.status === 'expired' ? '已过期' : '未使用'}
                </Text>
              </View>
            </View>
          ))}
          {myCoupons.length === 0 && (
            <View className="py-16 text-center">
              <Text className="text-gray-400 text-sm">还没有领取优惠券</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

export default CouponPage;
