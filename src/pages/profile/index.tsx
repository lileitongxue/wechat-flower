import { View, Text } from '@tarojs/components';
import { Button } from '@/components/ui/button';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { Api, Profile } from '@/api';
import { useAuthStore } from '@/store/auth';

const ProfilePage = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const user = useAuthStore((s) => s.user);

  useLoad(async () => {
    const u = useAuthStore.getState().user;
    if (!u) {
      return;
    }
    try {
      const p = await Api.getProfile();
      setProfile(p);
    } catch (err) {
      console.error(err);
    }
  });

  const goLogin = () => {
    Taro.navigateTo({ url: '/pages/login/index?redirect=/pages/profile/index' });
  };

  const signOut = async () => {
    await useAuthStore.getState().signOut();
    setProfile(null);
    Taro.showToast({ title: '已退出登录', icon: 'none' });
  };

  return (
    <View className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <View className="bg-gradient-to-r from-rose-400 to-rose-600 px-5 pt-12 pb-8">
        {user ? (
          <View className="flex items-center gap-3">
            <View className="w-16 h-16 rounded-full bg-white bg-opacity-30 flex items-center justify-center">
              <Text className="text-2xl text-white">🌷</Text>
            </View>
            <View>
              <Text className="text-white text-lg font-bold block">
                {profile?.nickname || user.email?.split('@')[0] || '花友'}
              </Text>
              <Text className="text-white text-opacity-80 text-xs">{user.email}</Text>
            </View>
          </View>
        ) : (
          <View className="flex items-center gap-3" onClick={goLogin}>
            <View className="w-16 h-16 rounded-full bg-white bg-opacity-30 flex items-center justify-center">
              <Text className="text-2xl text-white">👤</Text>
            </View>
            <View>
              <Text className="text-white text-lg font-bold block">未登录</Text>
              <Text className="text-white text-opacity-80 text-xs">点击登录，享受会员服务</Text>
            </View>
          </View>
        )}
      </View>

      {/* 菜单 */}
      <View className="bg-white mx-3 mt-3 rounded-xl px-4 py-2">
        <View className="flex items-center py-3 border-b border-gray-50" onClick={() => Taro.navigateTo({ url: '/pages/order/index' })}>
          <Text className="mr-3">📦</Text>
          <Text className="flex-1 text-sm">我的订单</Text>
          <Text className="text-gray-400">›</Text>
        </View>
        <View className="flex items-center py-3 border-b border-gray-50" onClick={() => Taro.navigateTo({ url: '/pages/coupon/index' })}>
          <Text className="mr-3">🎫</Text>
          <Text className="flex-1 text-sm">优惠券</Text>
          <Text className="text-gray-400">›</Text>
        </View>
        <View className="flex items-center py-3 border-b border-gray-50" onClick={() => Taro.navigateTo({ url: '/pages/appointment/index' })}>
          <Text className="mr-3">🗓️</Text>
          <Text className="flex-1 text-sm">我的预约</Text>
          <Text className="text-gray-400">›</Text>
        </View>
        <View className="flex items-center py-3" onClick={() => Taro.navigateTo({ url: '/pages/cart/index' })}>
          <Text className="mr-3">🛒</Text>
          <Text className="flex-1 text-sm">购物车</Text>
          <Text className="text-gray-400">›</Text>
        </View>
      </View>

      {user && (
        <Button
          className="!bg-white !text-gray-500 !rounded-xl text-sm mx-3 mt-3"
          onClick={signOut}
        >
          退出登录
        </Button>
      )}
    </View>
  );
};

export default ProfilePage;
