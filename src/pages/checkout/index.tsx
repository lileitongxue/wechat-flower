import { View, Text, Image, Radio, RadioGroup } from '@tarojs/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { Api, MyCoupon } from '@/api';
import { useCartStore } from '@/store/cart';
import { useAuthStore } from '@/store/auth';

const CheckoutPage = () => {
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('delivery');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [coupons, setCoupons] = useState<MyCoupon[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<number | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const items = useCartStore((s) => s.items);

  useLoad(async () => {
    const user = useAuthStore.getState().user;
    if (!user) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => {
        Taro.navigateTo({ url: '/pages/login/index?redirect=/pages/checkout/index' });
      }, 500);
      return;
    }
    try {
      const my = await Api.getMyCoupons();
      setCoupons(my || []);
    } catch (err) {
      console.error(err);
    }
  });

  const totalAmount = items.reduce((sum, it) => sum + it.price * it.quantity, 0);

  const applyCoupon = () => {
    if (!selectedCouponId) return 0;
    const coupon = coupons.find((c) => c.id === selectedCouponId)?.coupons;
    if (!coupon) return 0;
    if (totalAmount < Number(coupon.min_amount || 0)) return 0;
    const value = Number(coupon.value);
    return coupon.type === 'percent' ? Math.floor(totalAmount * (1 - value / 100)) : value;
  };

  const discount = applyCoupon();
  const payAmount = Math.max(totalAmount - discount, 0);

  const submit = async () => {
    if (!name.trim() || !phone.trim()) {
      Taro.showToast({ title: '请填写收货信息', icon: 'none' });
      return;
    }
    if (deliveryType === 'delivery' && !address.trim()) {
      Taro.showToast({ title: '请填写收货地址', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      const order = await Api.createOrder({
        items: items.map((it) => ({ product_id: it.product_id, quantity: it.quantity })),
        delivery_type: deliveryType,
        receiver_name: name.trim(),
        receiver_phone: phone.trim(),
        receiver_address: deliveryType === 'delivery' ? address.trim() : undefined,
        user_coupon_id: selectedCouponId,
      });
      useCartStore.getState().clear();
      Taro.showToast({ title: '下单成功', icon: 'success' });
      setTimeout(() => {
        Taro.redirectTo({ url: `/pages/order/index?id=${order.order_id}` });
      }, 600);
    } catch (err) {
      Taro.showToast({ title: err.message || '下单失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="min-h-screen bg-gray-50 pb-24">
      {/* 商品清单 */}
      <View className="bg-white px-4 py-3 mt-3">
        <Text className="text-base font-bold mb-2">商品清单</Text>
        {(items || []).map((it) => (
          <View key={it.product_id} className="flex items-center gap-3 py-2">
            <Image className="w-12 h-12 rounded-lg" src={it.image_url} mode="aspectFill" />
            <View className="flex-1 min-w-0">
              <Text className="block text-sm truncate">{it.name}</Text>
              <Text className="text-xs text-gray-400">x{it.quantity}</Text>
            </View>
            <Text className="text-rose-600 text-sm">¥{(it.price * it.quantity).toFixed(2)}</Text>
          </View>
        ))}
        <View className="border-t border-gray-100 pt-2 flex justify-between">
          <Text className="text-gray-500 text-sm">商品合计</Text>
          <Text className="text-sm font-medium">¥{totalAmount.toFixed(2)}</Text>
        </View>
      </View>

      {/* 配送方式 */}
      <View className="bg-white px-4 py-3 mt-3">
        <Text className="text-base font-bold mb-2">配送方式</Text>
        <RadioGroup
          onChange={(e) => setDeliveryType(e.detail.value as 'delivery' | 'pickup')}
          className="flex gap-6"
        >
          <View className="flex items-center gap-1">
            <Radio value="delivery" checked={deliveryType === 'delivery'} color="#f43f5e" />
            <Text className="text-sm">同城配送</Text>
          </View>
          <View className="flex items-center gap-1">
            <Radio value="pickup" checked={deliveryType === 'pickup'} color="#f43f5e" />
            <Text className="text-sm">门店自提</Text>
          </View>
        </RadioGroup>
      </View>

      {/* 收货信息 */}
      <View className="bg-white px-4 py-3 mt-3">
        <Text className="text-base font-bold mb-2">{deliveryType === 'delivery' ? '收货信息' : '自提信息'}</Text>
        <Input
          className="bg-gray-50 rounded-lg px-3 py-2 text-sm mb-2"
          placeholder="联系人姓名"
          value={name}
          onInput={(e) => setName(e.detail.value)}
        />
        <Input
          className="bg-gray-50 rounded-lg px-3 py-2 text-sm mb-2"
          placeholder="手机号"
          type="number"
          value={phone}
          onInput={(e) => setPhone(e.detail.value)}
        />
        {deliveryType === 'delivery' && (
          <Input
            className="bg-gray-50 rounded-lg px-3 py-2 text-sm"
            placeholder="详细收货地址"
            value={address}
            onInput={(e) => setAddress(e.detail.value)}
          />
        )}
      </View>

      {/* 优惠券 */}
      <View className="bg-white px-4 py-3 mt-3">
        <Text className="text-base font-bold mb-2">优惠券</Text>
        {coupons.length === 0 ? (
          <Text className="text-xs text-gray-400">暂无可用优惠券</Text>
        ) : (
          <RadioGroup onChange={(e) => setSelectedCouponId(Number(e.detail.value))} className="space-y-2">
            <View className="flex items-center gap-1 py-1">
              <Radio value="" checked={!selectedCouponId} color="#f43f5e" />
              <Text className="text-sm">不使用优惠券</Text>
            </View>
            {(coupons || []).map((c) => {
              const usable = totalAmount >= Number(c.coupons?.min_amount || 0);
              return (
                <View key={c.id} className="flex items-center gap-1 py-1">
                  <Radio value={String(c.id)} checked={selectedCouponId === c.id} color="#f43f5e" disabled={!usable} />
                  <Text className={`text-sm ${usable ? '' : 'text-gray-400'}`}>
                    {c.coupons?.name || `满${c.coupons?.min_amount}减${c.coupons?.value}`}
                    {!usable ? '（未满足使用条件）' : ''}
                  </Text>
                </View>
              );
            })}
          </RadioGroup>
        )}
      </View>

      {/* 底部支付栏 */}
      <View className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
        <View className="flex-1">
          <Text className="text-xs text-gray-500">实付：</Text>
          <Text className="text-rose-600 text-lg font-bold">¥{payAmount.toFixed(2)}</Text>
          {discount > 0 && <Text className="text-xs text-gray-400 ml-1">已优惠¥{discount.toFixed(2)}</Text>}
        </View>
        <Button
          className="!bg-rose-500 !text-white !rounded-full text-sm font-medium px-6"
          disabled={submitting}
          onClick={submit}
        >
          提交订单
        </Button>
      </View>
    </View>
  );
};

export default CheckoutPage;
