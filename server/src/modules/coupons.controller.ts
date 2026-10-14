import { Controller, Get, Post, Param, Req } from '@nestjs/common';
import { Request } from 'express';
import { SupabaseService } from '@/common/supabase.service';

@Controller('coupons')
export class CouponsController {
  constructor(private readonly supabase: SupabaseService) {}

  /** 可领取的优惠券列表（公开） */
  @Get()
  async list() {
    const client = await this.supabase.getPublicClient();
    const now = new Date().toISOString();
    const { data, error } = await client
      .from('coupons')
      .select('id, name, type, value, min_amount, claimed_count, total_count, start_date, end_date')
      .eq('status', 'active')
      .or(`start_date.is.null,start_date.lte.${now}`)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`查询优惠券失败: ${error.message}`);
    return { status: 'success', data: data || [] };
  }

  /** 领取优惠券（需登录） */
  @Post(':id/claim')
  async claim(@Req() req: Request, @Param('id') id: string) {
    const { client, user } = await this.supabase.requireAuth(req);
    const couponId = parseInt(id, 10);

    // 查是否已领取
    const { data: existing, error: eErr } = await client
      .from('user_coupons')
      .select('id')
      .eq('user_id', user.id)
      .eq('coupon_id', couponId)
      .maybeSingle();
    if (eErr) throw new Error(`查询领取记录失败: ${eErr.message}`);
    if (existing) {
      throw new Error('您已领取过该优惠券');
    }

    // 查询券模板并检查余量
    const { data: coupon, error: cErr } = await client
      .from('coupons')
      .select('id, status, total_count, claimed_count')
      .eq('id', couponId)
      .eq('status', 'active')
      .maybeSingle();
    if (cErr) throw new Error(`查询优惠券失败: ${cErr.message}`);
    if (!coupon) {
      throw new Error('优惠券不存在或已停发');
    }
    if (coupon.total_count > 0 && coupon.claimed_count >= coupon.total_count) {
      throw new Error('优惠券已被领完');
    }

    // 领取 + 计数（先领后计，简化处理）
    const { data: uc, error: iErr } = await client
      .from('user_coupons')
      .insert({ user_id: user.id, coupon_id: couponId, status: 'unused' })
      .select()
      .single();
    if (iErr) throw new Error(`领取失败: ${iErr.message}`);
    await client
      .from('coupons')
      .update({ claimed_count: (coupon.claimed_count || 0) + 1 })
      .eq('id', couponId);

    return { status: 'success', data: uc };
  }

  /** 我的优惠券（需登录） */
  @Get('my')
  async my(@Req() req: Request) {
    const { client, user } = await this.supabase.requireAuth(req);
    const { data, error } = await client
      .from('user_coupons')
      .select('id, status, claimed_at, used_at, coupons(id, name, type, value, min_amount, end_date)')
      .eq('user_id', user.id)
      .order('claimed_at', { ascending: false });
    if (error) throw new Error(`查询我的优惠券失败: ${error.message}`);
    return { status: 'success', data: data || [] };
  }
}
