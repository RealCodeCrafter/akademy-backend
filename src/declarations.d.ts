declare module 'express-serve-static-core' {
  interface Request {
    rawBody?: Buffer | string;
  }
}