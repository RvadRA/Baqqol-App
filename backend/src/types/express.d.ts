import "express";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      globalIdentityId?: string;
     file?: Multer.File;
    }
  }
}