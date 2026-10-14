import { Controller, Get, Post, Body, Param, Req } from '@nestjs/common';
import { Request } from 'express';
import { SupabaseService } from '@/common/supabase.service';

interface OrderItemInput {
  product_id: number;
  quantity: number;
}

interface CreateOrderBody {
  items: OrderItemInput[];
  delivery_type: 'delivery' | 'pickup';
  receiver_name?: string;
  receiver_phone?: string;
  receiver_address?: string;
  pickup_time?: string;
  remark?: string;
  user_coupon_id?: number;
}

interface OrderItemRow {
  product_id: number;
  product_name: string;
  product_image: string | null;
  price: string;
  quantity: number;
  user_id: string;
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly supabase: SupabaseService) {}

  @Post()
  async create(@Req() req: Request, @Body() body: CreateOrderBody) {
    const { client, user } = await this.supabase.requireAuth(req);

    if (!body.items || body.items.length === 0) {
      throw new Error('订单商品不能为空');
    }
    if (!['delivery', 'pickup'].includes(body.delivery_type)) {
      throw new Error('配送方式不合法');
    }
    if (body.delivery_type === 'delivery' && (!body.receiver_name || !body.receiver_phone || !body.receiver_address)) {
      throw new Error('配送订单必须填写收货人、电话和地址');
    }

    // 批量取商品，校验库存与价格
    const productIds = body.items.map((i) => i.product_id);
    const { data: products, error: pErr } = await client
      .from('products')
      .select('id, name, price, image_url, stock, sales, status')
      .in('id', productIds);
    if (pErr) throw new Error(`查询商品失败: ${pErr.message}`);
    const productMap = new Map((products || []).map((p) => [p.id, p]));

    let totalAmount = 0;
    const orderItemRows: OrderItemRow[] = [];
    for (const item of body.items) {
      const product = productMap.get(item.product_id);
      if (!product || product.status !== 'on_sale') {
        throw new Error(`商品 ${item.product_id} 不存在或已下架`);
      }
      if (product.stock < item.quantity) {
        throw new Error(`「${product.name}」库存不足`);
      }
      const subtotal = Number(product.price) * item.quantity;
      totalAmount += subtotal;
      orderItemRows.push({
        product_id: product.id,
        product_name: product.name,
        product_image: product.image_url,
        price: product.price,
        quantity: item.quantity,
        user_id: user.id,
      });
    }

    // 优惠券抵扣
    let discountAmount = 0;
    if (body.user_coupon_id) {
      const { data: uc, error: ucErr } = await client
        .from('user_coupons')
        .select('id, status, coupon_id, coupons(id, status, type, value, min_amount)')
        .eq('id', body.user_coupon_id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (ucErr) throw new Error(`查询优惠券失败: ${ucErr.message}`);
      if (!uc || uc.status !== 'unused') {
        throw new Error('优惠券不可用');
      }
      const coupon = (uc as any).coupons;
      if (!coupon || coupon.status !== 'active') {
        throw new Error('优惠券已失效');
      }
      if (totalAmount < Number(coupon.min_amount)) {
        throw new Error(`未达到优惠券使用门槛（满 ${coupon.min_amount} 可用）`);
      }
      discountAmount = Math.min(Number(coupon.value), totalAmount);
      // 标记优惠券已使用
      await client.from('user_coupons').update({ status: 'used', used_at: new Date().toISOString() }).eq('id', uc.id);
    }

    const payAmount = Math.max(0, totalAmount - discountAmount);

    // 生成订单号：时间戳 + 随机
    const orderNo = `FS${Date.now()}${Math.floor(Math.random() * 10000)}`;

    // 插入订单
    const { data: order, error: oErr } = await client
      .from('orders')
      .insert({
        order_no: orderNo,
        user_id: user.id,
        total_amount: totalAmount.toFixed(2),
        discount_amount: discountAmount.toFixed(2),
        pay_amount: payAmount.toFixed(2),
        delivery_type: body.delivery_type,
        receiver_name: body.receiver_name || null,
        receiver_phone: body.receiver_phone || null,
        receiver_address: body.receiver_address || null,
        pickup_time: body.pickup_time || null,
        remark: body.remark || null,
        status: 'pending',
      })
      .select()
      .single();
    if (oErr) throw new Error(`创建订单失败: ${oErr.message}`);

    // 插入订单项
    const itemRows = orderItemRows.map((r) => ({ ...r, order_id: order.id }));
    const { error: iErr } = await client.from('order_items').insert(itemRows);
    if (iErr) throw new Error(`创建订单明细失败: ${iErr.message}`);

    // 扣减库存、累加销量
    for (const item of body.items) {
      const product = productMap.get(item.product_id)!;
      await client
        .from('products')
        .update({ stock: product.stock - item.quantity, sales: (product.sales || 0) + item.quantity })
        .eq('id', product.id);
    }

    return {
      status: 'success',
      data: { order_id: order.id, order_no: order.order_no, pay_amount: order.pay_amount, status: order.status },
    };
  }

  @Get()
  async myOrders(@Req() req: Request) {
    const { client, user } = await this.supabase.requireAuth(req);
    const { data, error } = await client
      .from('orders')
      .select('id, order_no, total_amount, discount_amount, pay_amount, delivery_type, status, created_at, order_items(product_name, product_image, price, quantity)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`查询订单失败: ${error.message}`);
    return { status: 'success', data: data || [] };
  }

  @Get(':id')
  async detail(@Req() req: Request, @Param('id') id: string) {
    const { client, user } = await this.supabase.requireAuth(req);
    const { data, error } = await client
      .from('orders')
      .select('id, order_no, total_amount, discount_amount, pay_amount, delivery_type, receiver_name, receiver_phone, receiver_address, pickup_time, remark, status, created_at, order_items(product_name, product_image, price, quantity)')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw new Error(`查询订单失败: ${error.message}`);
    return { status: 'success', data };
  }
}
