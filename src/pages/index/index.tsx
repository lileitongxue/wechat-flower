import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { Api, Category, Product } from '@/api';
import { useCartStore } from '@/store/cart';
import './index.css';

const IndexPage = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [hot, setHot] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const cartCount = useCartStore((s) => s.totalCount());

  useLoad(async () => {
    useCartStore.getState().load();
    try {
      const [cats, feat, all] = await Promise.all([
        Api.getCategories(),
        Api.getProducts({ featured: true, page_size: 4 }),
        Api.getProducts({ page_size: 4, sort: 'sales' }),
      ]);
      setCategories(cats || []);
      setFeatured(feat || []);
      setHot(all || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  });

  const goCategory = (id?: number) => {
    Taro.navigateTo({ url: id ? `/pages/category/index?category_id=${id}` : '/pages/category/index' });
  };

  const goProduct = (id: number) => {
    Taro.navigateTo({ url: `/pages/product/index?id=${id}` });
  };

  const goCart = () => Taro.switchTab({ url: '/pages/cart/index' });

  const goAppointment = () => Taro.switchTab({ url: '/pages/appointment/index' });

  return (
    <View className="min-h-screen bg-gray-50 pb-6">
      {/* Banner */}
      <View className="relative h-52 bg-gradient-to-br from-rose-400 to-pink-500 overflow-hidden">
        <Image
          className="w-full h-full"
          src="https://s.coze.cn/image/ufmEBU-Tj8A/"
          mode="aspectFill"
        />
        <View className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent" />
        <View className="absolute bottom-4 left-4 right-4">
          <Text className="text-white text-3xl font-bold drop-shadow">花遇鲜花</Text>
          <View className="mt-1 flex items-center gap-2">
            <Text className="text-white text-opacity-90 text-sm">每一束花，都是心意的表达</Text>
          </View>
        </View>
        <View
          className="absolute top-4 right-4 flex items-center justify-center w-11 h-11 rounded-full bg-white bg-opacity-25"
          onClick={goCart}
        >
          <Text className="text-white text-xl">🛒</Text>
          {cartCount > 0 && (
            <View className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 flex items-center justify-center">
              <Text className="text-white text-xs">{cartCount}</Text>
            </View>
          )}
        </View>
      </View>

      {/* 分类导航 */}
      <View className="px-4 -mt-6 relative z-10">
        <View className="bg-white rounded-2xl shadow-sm p-4">
          <View className="flex items-center justify-between mb-3">
            <Text className="text-base font-bold">鲜花分类</Text>
            <Text className="text-xs text-gray-400" onClick={() => goCategory()}>
              全部{'>'}
            </Text>
          </View>
          <View className="grid grid-cols-4 gap-3">
            {(categories || []).map((c) => (
              <View
                key={c.id}
                className="flex flex-col items-center gap-1 py-2"
                onClick={() => goCategory(c.id)}
              >
                <View className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-2xl">
                  {c.icon || '🌸'}
                </View>
                <Text className="text-xs text-gray-700">{c.name}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* 精选推荐 */}
      <View className="px-4 mt-6">
        <View className="flex items-center justify-between mb-3">
          <Text className="text-lg font-bold">精选推荐</Text>
          <Text className="text-xs text-gray-400" onClick={() => goCategory()}>
            查看更多{'>'}
          </Text>
        </View>
        <ScrollView scrollX className="w-full" enhanced showScrollbar={false}>
          <View className="flex gap-3 pr-2">
            {(featured || []).map((p) => (
              <View
                key={p.id}
                className="w-40 shrink-0 bg-white rounded-xl overflow-hidden shadow-sm"
                onClick={() => goProduct(p.id)}
              >
                <Image className="w-40 h-40" src={p.image_url || ''} mode="aspectFill" />
                <View className="p-3">
                  <Text className="block text-sm font-medium text-gray-800 truncate">{p.name}</Text>
                  <View className="mt-1 flex items-center gap-1">
                    <Text className="text-rose-600 text-base font-bold">¥{p.price}</Text>
                    {p.original_price ? (
                      <Text className="text-xs text-gray-400 line-through">¥{p.original_price}</Text>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* 热销榜单 */}
      <View className="px-4 mt-6">
        <View className="flex items-center justify-between mb-3">
          <Text className="text-lg font-bold">热销榜单</Text>
          <Text className="text-xs text-gray-400" onClick={() => goCategory()}>
            查看更多{'>'}
          </Text>
        </View>
        <View className="flex flex-col gap-3">
          {(hot || []).map((p, idx) => (
            <View
              key={p.id}
              className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm"
              onClick={() => goProduct(p.id)}
            >
              <View className="w-7 h-7 rounded-md flex items-center justify-center bg-amber-100">
                <Text className="text-amber-600 font-bold text-sm">#{idx + 1}</Text>
              </View>
              <Image className="w-16 h-16 rounded-lg" src={p.image_url || ''} mode="aspectFill" />
              <View className="flex-1 min-w-0">
                <Text className="block text-sm font-medium text-gray-800 truncate">{p.name}</Text>
                <Text className="block text-xs text-gray-400 mt-1">已售 {p.sales} 件</Text>
              </View>
              <View className="text-right">
                <Text className="text-rose-600 text-base font-bold">¥{p.price}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* 预约入口 */}
      <View
        className="mx-4 mt-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 p-4 flex items-center justify-between"
        onClick={goAppointment}
      >
        <View>
          <Text className="text-white text-base font-bold">预约订花 · 专属花艺</Text>
          <Text className="block text-white text-opacity-80 text-xs mt-1">求婚、开业、节日定制，花艺师一对一服务</Text>
        </View>
        <Text className="text-white text-2xl">💐</Text>
      </View>

      {loading && (
        <View className="py-10 text-center">
          <Text className="text-gray-400 text-sm">加载中...</Text>
        </View>
      )}
    </View>
  );
};

export default IndexPage;
