import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // JSON va JWT uchun body parser
  app.use(bodyParser.json({ type: ['application/json', 'application/jwt'] }));
  app.use(bodyParser.text({ type: 'text/plain' }));

  // Global validatsiya
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // CORS sozlamalari
  app.enableCors({
    origin: '*',
    credentials: true,
  });

  await app.listen(7000, '0.0.0.0');
}
bootstrap();