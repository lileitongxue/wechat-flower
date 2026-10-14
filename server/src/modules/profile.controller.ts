import { Controller, Get, Put, Body, Req } from '@nestjs/common';
import { Request } from 'express';
import { SupabaseService } from '@/common/supabase.service';

interface UpdateProfileBody {
  nickname?: string;
  avatar_url?: string;
  phone?: string;
}

@Controller('profile')
export class ProfileController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  async get(@Req() req: Request) {
    const { client, user } = await this.supabase.requireAuth(req);
    // 首次访问自动创建资料行
    const { data: existing, error: qErr } = await client
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (qErr) throw new Error(`查询用户资料失败: ${qErr.message}`);
    if (existing) {
      return { status: 'success', data: existing };
    }
    const { data: created, error: cErr } = await client
      .from('user_profiles')
      .insert({
        user_id: user.id,
        nickname: (user.user_metadata as any)?.full_name || user.email?.split('@')[0] || '花友',
        avatar_url: null,
        phone: null,
        points: 0,
        level: 'normal',
      })
      .select()
      .single();
    if (cErr) throw new Error(`创建用户资料失败: ${cErr.message}`);
    return { status: 'success', data: created };
  }

  @Put()
  async update(@Req() req: Request, @Body() body: UpdateProfileBody) {
    const { client, user } = await this.supabase.requireAuth(req);
    const patch: Record<string, any> = {};
    if (body.nickname !== undefined) patch.nickname = body.nickname;
    if (body.avatar_url !== undefined) patch.avatar_url = body.avatar_url;
    if (body.phone !== undefined) patch.phone = body.phone;
    if (Object.keys(patch).length === 0) {
      throw new Error('没有需要更新的内容');
    }
    const { data, error } = await client
      .from('user_profiles')
      .update(patch)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) throw new Error(`更新用户资料失败: ${error.message}`);
    return { status: 'success', data };
  }
}
