import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export interface AuthUser {
  id: string;
  email?: string;
  [key: string]: any;
}

@Injectable()
export class SupabaseService {
  /** 匿名客户端：仅用于公开数据（RLS 已允许公开读取） */
  async getPublicClient(): Promise<SupabaseClient> {
    return getSupabaseClient();
  }

  /**
   * 鉴权：从 x-session 头取 token，返回带用户身份的 client 和用户信息。
   * 未登录或 token 失效时抛 401。
   */
  async requireAuth(req: Request): Promise<{ client: SupabaseClient; user: AuthUser }> {
    const token = req.headers['x-session'] as string | undefined;
    if (!token) {
      throw new UnauthorizedException('请先登录');
    }
    const client = await getSupabaseClient(token);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }
    return { client, user: data.user as AuthUser };
  }
}
