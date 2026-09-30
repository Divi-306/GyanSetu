declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: 'student' | 'admin' };
    }
  }
}

export {};
