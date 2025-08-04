import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './user/user.module';
import { RequestsModule } from './request/request.module';
import { CoursesModule } from './course/course.module';
import { PurchasesModule } from './purchases/purchases.module';
import { Category } from './category/entities/cateogry.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'nozomi.proxy.rlwy.net',
      port: 43482,
      username: 'postgres',
      password: 'RsGzZbKHlZwrLakJWmsKolSNEXwUgZVU',
      database: 'railway',
      synchronize: true,
      autoLoadEntities: true,
      ssl: {
        rejectUnauthorized: false
      },
    }),
    AuthModule,
    UsersModule,
    RequestsModule,
    CoursesModule,
    PurchasesModule,
    Category
  ],
})
export class AppModule {}