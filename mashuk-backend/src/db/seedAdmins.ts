import { eq } from 'drizzle-orm';
import { db } from './index.js';
import { adminUsers } from './schema.js';
import { hashPassword } from '../utils/password.js';

/** Default admin accounts — change passwords in DB after first deploy if needed. */
export const DEFAULT_ADMINS = [
  { login: 'zuev', password: 'ZuevPu26', role: 'superadmin' },
  { login: 'serveeva', password: 'Servee26', role: 'admin' },
  { login: 'avakan', password: 'Avakan26', role: 'admin' },
] as const;

export async function seedAdminUsers(): Promise<void> {
  for (const admin of DEFAULT_ADMINS) {
    const passwordHash = await hashPassword(admin.password);
    const [existing] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.login, admin.login))
      .limit(1);

    if (existing) {
      await db
        .update(adminUsers)
        .set({ passwordHash, role: admin.role })
        .where(eq(adminUsers.login, admin.login));
    } else {
      await db.insert(adminUsers).values({
        login: admin.login,
        passwordHash,
        role: admin.role,
      });
    }
  }

  await db.delete(adminUsers).where(eq(adminUsers.login, 'admin'));
  console.log('Admin users seeded: zuev, serveeva, avakan');
}
