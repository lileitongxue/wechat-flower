import { Module } from '@nestjs/common';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { SupabaseService } from '@/common/supabase.service';
import { CategoriesController, ProductsController } from '@/modules/catalog.controller';
import { OrdersController } from '@/modules/orders.controller';
import { AppointmentsController } from '@/modules/appointments.controller';
import { ProfileController } from '@/modules/profile.controller';
import { CouponsController } from '@/modules/coupons.controller';
import { SupabaseConfigController } from '@/modules/supabase-config.controller';

@Module({
  imports: [],
  controllers: [
    AppController,
    SupabaseConfigController,
    CategoriesController,
    ProductsController,
    OrdersController,
    AppointmentsController,
    ProfileController,
    CouponsController,
  ],
  providers: [AppService, SupabaseService],
})
export class AppModule {}
