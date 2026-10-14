import { View, Text, Image } from '@tarojs/components';
import { Button } from '@/components/ui/button';
import Taro, { useLoad } from '@tarojs/taro';
import { useCartStore } from '@/store/cart';

const CartPage = () => {
  const items = useCartStore((s) => s.items);

  useLoad(() => {
    useCartStore.getState().load();
  });

  const goProduct = (id: number) => {
    Taro.navigateTo({ url: `/pages/product/index?id=${id}` });
  };

  const goCheckout = () => {
    if (items.length === 0) {
      Taro.showToast({ title: '购物车是空的', icon: 'none' });
      return;
    }
    Taro.navigateTo({ url: '/pages/checkout/index' });
  };

  return (
    <View className="min-h-screen bg-gray-50 pb-24">
      {items.length === 0 ? (
        <View className="pt-20 flex flex-col items-center">
          <Text className="text-5xl mb-4">🛒</Text>
          <Text className="text-gray-400 mb-6">购物车还是空的</Text>
          <Button
            className="!bg-rose-500 !text-white !rounded-full text-sm px-8"
            onClick={() => Taro.switchTab({ url: '/pages/index/index' })}
          >
            去逛逛
          </Button>
        </View>
      ) : (
        <View className="px-3 pt-3">
          {(items || []).map((item) => (
            <View key={item.product_id} className="bg-white rounded-xl p-3 mb-3 flex gap-3">
              <Image
                className="w-20 h-20 rounded-lg"
                src={item.image_url}
                mode="aspectFill"
                onClick={() => goProduct(item.product_id)}
              />
              <View className="flex-1 min-w-0">
                <Text className="block text-sm font-medium text-gray-800 truncate">{item.name}</Text>
                <View className="flex items-center gap-1 mt-1">
                  <Text className="text-rose-600 font-bold">¥{item.price}</Text>
                </View>
                <View className="flex items-center justify-between mt-2">
                  <View className="flex items-center gap-2 border border-gray-200 rounded-full px-2 py-1">
                    <Text
                      className="text-lg text-gray-500 w-5 text-center"
                      onClick={() => useCartStore.getState().updateQuantity(item.product_id, item.quantity - 1)}
                    >
                      −
                    </Text>
                    <Text className="w-7 text-center text-sm">{item.quantity}</Text>
                    <Text
                      className="text-lg text-gray-500 w-5 text-center"
                      onClick={() => useCartStore.getState().updateQuantity(item.product_id, item.quantity + 1)}
                    >
                      +
                    </Text>
                  </View>
                  <Text
                    className="text-xs text-gray-400"
                    onClick={() => useCartStore.getState().remove(item.product_id)}
                  >
                    删除
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* 底部结算栏 */}
      {items.length > 0 && (
        <View className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
          <View className="flex-1">
            <View className="flex items-baseline gap-1">
              <Text className="text-xs text-gray-500">合计：</Text>
              <Text className="text-rose-600 text-lg font-bold">¥{useCartStore.getState().totalAmount()}</Text>
            </View>
          </View>
          <Button
            className="!bg-rose-500 !text-white !rounded-full text-sm font-medium px-6"
            onClick={goCheckout}
          >
            去结算({useCartStore.getState().totalCount()})
          </Button>
        </View>
      )}
    </View>
  );
};

export default CartPage;
