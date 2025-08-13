import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // CORS sozlamasi: barcha domenlar uchun ochiq
  app.enableCors({
    origin: '*', // Har qanday domendan so'rov qabul qilinadi
    methods: ['POST', 'GET', 'OPTIONS'], // OPTIONS preflight uchun
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Port va host
  await app.listen(7000, '0.0.0.0');
}
bootstrap();