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
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
    type: 'postgres',
    host: config.get<string>('DB_HOST') ?? 'localhost',
    port: parseInt(config.get<string>('DB_PORT') ?? '5432', 10),
    username: config.get<string>('DB_USERNAME') ?? 'postgres',
    password: config.get<string>('DB_PASSWORD') ?? 'postgres',
    database: config.get<string>('DB_NAME') ?? 'test',
    synchronize: true,
    autoLoadEntities: true,

    ssl: {
      rejectUnauthorized: false,

    },
  }),
}),

    AuthModule,
    UsersModule,
    RequestsModule,
    CoursesModule,
    PurchasesModule,
    CategoryModule,
    PaymentModule
  ],
  
})


export class AppModule {}

