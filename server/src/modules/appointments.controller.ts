import { Controller, Get, Post, Body, Req } from '@nestjs/common';
import { Request } from 'express';
import { SupabaseService } from '@/common/supabase.service';

interface CreateAppointmentBody {
  type: string;
  title: string;
  description?: string;
  appointment_date?: string;
  budget?: number;
  contact_name?: string;
  contact_phone?: string;
}

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly supabase: SupabaseService) {}

  @Post()
  async create(@Req() req: Request, @Body() body: CreateAppointmentBody) {
    const { client, user } = await this.supabase.requireAuth(req);
    if (!body.title || !body.title.trim()) {
      throw new Error('预约标题不能为空');
    }
    if (body.type && !['custom', 'festival', 'wedding'].includes(body.type)) {
      throw new Error('预约类型不合法');
    }
    const { data, error } = await client
      .from('appointments')
      .insert({
        user_id: user.id,
        type: body.type || 'custom',
        title: body.title.trim(),
        description: body.description || null,
        appointment_date: body.appointment_date || null,
        budget: body.budget != null ? body.budget.toFixed(2) : null,
        contact_name: body.contact_name || null,
        contact_phone: body.contact_phone || null,
        status: 'pending',
      })
      .select()
      .single();
    if (error) throw new Error(`创建预约失败: ${error.message}`);
    return { status: 'success', data };
  }

  @Get()
  async myAppointments(@Req() req: Request) {
    const { client, user } = await this.supabase.requireAuth(req);
    const { data, error } = await client
      .from('appointments')
      .select('id, type, title, description, appointment_date, budget, contact_name, contact_phone, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`查询预约失败: ${error.message}`);
    return { status: 'success', data: data || [] };
  }
}
