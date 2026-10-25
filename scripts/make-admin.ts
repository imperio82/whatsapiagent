/**
 * Da acceso al panel de la plataforma (Clientes y cobros) a un usuario existente.
 *   npm run admin:grant -- tu@correo.com
 * El usuario debe cerrar sesión y volver a entrar para verlo.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Falta el correo: npm run admin:grant -- tu@correo.com");
  const user = await prisma.user.update({ where: { email }, data: { isPlatformAdmin: true } });
  console.log(`${user.email} ahora es administrador de la plataforma`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
