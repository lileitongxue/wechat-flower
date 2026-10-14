import { Controller, Get } from '@nestjs/common';
import { getSupabaseCredentials } from '@/storage/database/supabase-client';

@Controller('supabase-config')
export class SupabaseConfigController {
  @Get()
  async get() {
    try {
      const { url, anonKey } = await getSupabaseCredentials();
      if (!url || !anonKey) {
        return { error: 'Supabase configuration is unavailable' };
      }
      return { url, anonKey };
    } catch (error) {
      console.error('Failed to get Supabase config:', error);
      return { error: 'Failed to get Supabase config' };
    }
  }
}
