import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Webhook route uchun raw body olish (signatura tekshirish uchun)
  app.use(
    '/payments/webhook',
    bodyParser.raw({ type: '*/*' }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: '*',
    credentials: true,
  });

  await app.listen(7000, '0.0.0.0');
}
bootstrap();
