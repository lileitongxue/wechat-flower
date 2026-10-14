import { View, Text, Image } from '@tarojs/components';
import { Button } from '@/components/ui/button';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { Api, Product } from '@/api';
import { useCartStore } from '@/store/cart';

const ProductPage = () => {
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);

  useLoad(async (params) => {
    try {
      const id = Number(params.id);
      const data = await Api.getProduct(id);
      setProduct(data);
    } catch (err) {
      console.error(err);
      Taro.showToast({ title: '商品加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  });

  const changeQuantity = (delta: number) => {
    if (!product) return;
    setQuantity((q) => Math.max(1, Math.min(q + delta, product.stock)));
  };

  const addToCart = () => {
    if (!product) return;
    useCartStore.getState().add({
      product_id: product.id,
      name: product.name,
      price: Number(product.price),
      image_url: product.image_url || '',
      stock: product.stock,
      quantity,
    });
    Taro.showToast({ title: '已加入购物车', icon: 'success' });
  };

  const buyNow = () => {
    if (!product) return;
    setBuying(true);
    useCartStore.getState().add({
      product_id: product.id,
      name: product.name,
      price: Number(product.price),
      image_url: product.image_url || '',
      stock: product.stock,
      quantity,
    });
    setTimeout(() => {
      setBuying(false);
      Taro.navigateTo({ url: '/pages/checkout/index' });
    }, 200);
  };

  if (loading) {
    return (
      <View className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Text className="text-gray-400">加载中...</Text>
      </View>
    );
  }

  if (!product) {
    return (
      <View className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Text className="text-gray-400">商品不存在</Text>
      </View>
    );
  }

  return (
    <View className="min-h-screen bg-gray-50 pb-24">
      <Image className="w-full h-96" src={product.image_url || ''} mode="aspectFill" />

      <View className="bg-white px-4 py-4 mt-1">
        <View className="flex items-center gap-2">
          <Text className="text-rose-600 text-2xl font-bold">¥{product.price}</Text>
          {product.original_price ? (
            <Text className="text-sm text-gray-400 line-through">¥{product.original_price}</Text>
          ) : null}
          <View className="ml-auto text-xs text-gray-400">已售 {product.sales} 件</View>
        </View>
        <Text className="block text-lg font-bold text-gray-900 mt-2">{product.name}</Text>
        {product.tags && product.tags.length > 0 && (
          <View className="flex gap-1 mt-2">
            {(product.tags || []).map((t) => (
              <View key={t} className="px-2 py-1 rounded-full bg-rose-50 text-rose-500 text-xs">
                {t}
              </View>
            ))}
          </View>
        )}
      </View>

      <View className="bg-white px-4 py-4 mt-1">
        <Text className="text-base font-bold">商品详情</Text>
        <Text className="block text-sm text-gray-600 mt-2 leading-relaxed">
          {product.description || '暂无描述'}
        </Text>
      </View>

      {/* 底部操作栏 */}
      <View className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
        <View className="flex items-center gap-3 border border-gray-200 rounded-full px-3 py-2">
          <Text className="text-xl text-gray-500 w-6 text-center" onClick={() => changeQuantity(-1)}>
            −
          </Text>
          <Text className="w-8 text-center text-sm font-medium">{quantity}</Text>
          <Text className="text-xl text-gray-500 w-6 text-center" onClick={() => changeQuantity(1)}>
            +
          </Text>
        </View>
        <Button
          className="flex-1 !rounded-full !bg-rose-500 !text-white text-sm font-medium !border-0"
          onClick={addToCart}
        >
          加入购物车
        </Button>
        <Button
          className="flex-1 !rounded-full !bg-gray-900 !text-white text-sm font-medium !border-0"
          disabled={buying}
          onClick={buyNow}
        >
          {buying ? '跳转中...' : '立即购买'}
        </Button>
      </View>
    </View>
  );
};

export default ProductPage;
