import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './user/user.module';
import { RequestsModule } from './request/request.module';
import { CoursesModule } from './course/course.module';
import { PurchasesModule } from './purchases/purchases.module';
import { CategoryModule } from './category/category.module';
import { PaymentModule } from './payment/payment.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('DB_HOST') || 'localhost';
        const port = configService.get<number>('DB_PORT') || 5432;
        const username = configService.get<string>('DB_USERNAME') || 'postgres';
        const password = configService.get<string>('DB_PASSWORD') || '';
        const database = configService.get<string>('DB_NAME') || 'test';

        return {
          type: 'postgres',
          host,
          port,
          username,
          password,
          database,
          synchronize: true,
          autoLoadEntities: true,
          ssl: {
            rejectUnauthorized: false,
          },
        };
      },
    }),

    AuthModule,
    UsersModule,
    RequestsModule,
    CoursesModule,
    PurchasesModule,
    CategoryModule,
    PaymentModule,
  ],
})
export class AppModule {}
