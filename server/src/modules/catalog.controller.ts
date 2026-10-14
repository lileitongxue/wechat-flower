import { Controller, Get, Query, Param } from '@nestjs/common';
import { SupabaseService } from '@/common/supabase.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  async list() {
    const client = await this.supabase.getPublicClient();
    const { data, error } = await client
      .from('categories')
      .select('id, name, icon, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`查询分类失败: ${error.message}`);
    return { status: 'success', data: data || [] };
  }
}

@Controller('products')
export class ProductsController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  async list(
    @Query('category_id') categoryId?: string,
    @Query('featured') featured?: string,
    @Query('keyword') keyword?: string,
    @Query('sort') sort?: string,
    @Query('page') page = '1',
    @Query('page_size') pageSize = '20',
  ) {
    const client = await this.supabase.getPublicClient();
    const p = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 20));
    let query = client
      .from('products')
      .select('id, name, description, price, original_price, image_url, images, sales, category_id, tags, is_featured', { count: 'exact' })
      .eq('status', 'on_sale');

    if (categoryId) {
      query = query.eq('category_id', parseInt(categoryId, 10));
    }
    if (featured === 'true') {
      query = query.eq('is_featured', true);
    }
    if (keyword && keyword.trim()) {
      query = query.ilike('name', `%${keyword.trim()}%`);
    }
    if (sort === 'sales') {
      query = query.order('sales', { ascending: false });
    } else if (sort === 'price_asc') {
      query = query.order('price', { ascending: true });
    } else if (sort === 'price_desc') {
      query = query.order('price', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }
    const { data, error, count } = await query.range((p - 1) * size, p * size - 1);
    if (error) throw new Error(`查询商品失败: ${error.message}`);
    return {
      status: 'success',
      data: data || [],
      pagination: { page: p, page_size: size, total: count ?? 0 },
    };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const client = await this.supabase.getPublicClient();
    const { data, error } = await client
      .from('products')
      .select('id, name, description, price, original_price, image_url, images, stock, sales, category_id, tags, is_featured')
      .eq('id', parseInt(id, 10))
      .maybeSingle();
    if (error) throw new Error(`查询商品失败: ${error.message}`);
    return { status: 'success', data };
  }
}
