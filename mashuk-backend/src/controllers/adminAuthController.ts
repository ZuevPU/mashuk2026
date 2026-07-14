import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { adminUsers } from '../db/schema.js';
import { verifyPassword } from '../utils/password.js';
import { createAdminToken } from '../utils/adminToken.js';

export async function adminLogin(req: Request, res: Response): Promise<void> {
  const login = typeof req.body?.login === 'string' ? req.body.login.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!login || !password) {
    res.status(400).json({ error: 'login and password are required' });
    return;
  }

  const [user] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.login, login))
    .limit(1);

  if (!user || user.isActive === false || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid login or password' });
    return;
  }

  const token = createAdminToken(user.id, user.login, user.role || 'admin');
  res.json({
    token,
    admin: { id: user.id, login: user.login, role: user.role },
  });
}
