import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PERMISSIONS = [
  { key: "products.read", resource: "products", action: "read" },
  { key: "products.create", resource: "products", action: "create" },
  { key: "products.update", resource: "products", action: "update" },
  { key: "products.delete", resource: "products", action: "delete" },
  { key: "orders.read", resource: "orders", action: "read" },
  { key: "orders.create", resource: "orders", action: "create" },
  { key: "orders.update", resource: "orders", action: "update" },
  { key: "orders.delete", resource: "orders", action: "delete" },
  { key: "clients.read", resource: "clients", action: "read" },
  { key: "clients.create", resource: "clients", action: "create" },
  { key: "clients.update", resource: "clients", action: "update" },
  { key: "clients.delete", resource: "clients", action: "delete" },
  { key: "leads.read", resource: "leads", action: "read" },
  { key: "leads.create", resource: "leads", action: "create" },
  { key: "leads.update", resource: "leads", action: "update" },
  { key: "leads.delete", resource: "leads", action: "delete" },
  { key: "chats.read", resource: "chats", action: "read" },
  { key: "chats.send", resource: "chats", action: "send" },
  { key: "chats.assign", resource: "chats", action: "assign" },
  { key: "templates.read", resource: "templates", action: "read" },
  { key: "templates.manage", resource: "templates", action: "manage" },
  { key: "team.read", resource: "team", action: "read" },
  { key: "team.invite", resource: "team", action: "invite" },
  { key: "team.manage_roles", resource: "team", action: "manage_roles" },
  { key: "tenant.settings", resource: "tenant", action: "settings" },
  { key: "tenant.billing", resource: "tenant", action: "billing" },
];

const SYSTEM_ROLES = [
  {
    key: "owner",
    name: "Dueño",
    description: "Acceso total al negocio.",
    permissions: "*" as const,
  },
  {
    key: "admin",
    name: "Administrador",
    description: "Gestiona equipo, productos, pedidos y clientes.",
    permissions: [
      "products.*",
      "orders.*",
      "clients.*",
      "leads.*",
      "chats.*",
      "templates.*",
      "team.read",
      "team.invite",
    ],
  },
  {
    key: "agent",
    name: "Agente",
    description: "Atiende chats, gestiona pedidos y leads.",
    permissions: [
      "products.read",
      "orders.read",
      "orders.create",
      "orders.update",
      "clients.read",
      "clients.create",
      "clients.update",
      "leads.*",
      "chats.*",
      "templates.read",
    ],
  },
  {
    key: "viewer",
    name: "Solo lectura",
    description: "Lee información sin modificar nada.",
    permissions: [
      "products.read",
      "orders.read",
      "clients.read",
      "leads.read",
      "chats.read",
      "templates.read",
    ],
  },
];

function matchPermission(pattern: string, key: string): boolean {
  if (pattern === "*") return true;
  if (pattern === key) return true;
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2);
    return key.startsWith(`${prefix}.`);
  }
  return false;
}

async function main(): Promise<void> {
  console.log("→ Creando permisos…");
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { resource: p.resource, action: p.action },
      create: p,
    });
  }

  console.log("→ Creando roles del sistema…");
  const allPerms = await prisma.permission.findMany();

  for (const role of SYSTEM_ROLES) {
    const existing = await prisma.role.findFirst({
      where: { key: role.key, isSystem: true, tenantId: null },
    });

    const created = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: { name: role.name, description: role.description },
        })
      : await prisma.role.create({
          data: {
            key: role.key,
            name: role.name,
            description: role.description,
            isSystem: true,
          },
        });

    const matched = allPerms.filter((perm) =>
      role.permissions === "*"
        ? true
        : (role.permissions as string[]).some((pat) => matchPermission(pat, perm.key)),
    );

    await prisma.rolePermission.deleteMany({ where: { roleId: created.id } });
    await prisma.rolePermission.createMany({
      data: matched.map((p) => ({ roleId: created.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  console.log("→ Creando tenant demo + usuario owner…");
  const passwordHash = await bcrypt.hash("demo1234", 10);

  const owner = await prisma.user.upsert({
    where: { email: "demo@whatsappia.app" },
    update: {},
    create: {
      email: "demo@whatsappia.app",
      name: "Demo Owner",
      passwordHash,
    },
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      slug: "demo",
      name: "Negocio Demo",
      industry: "Retail",
      description: "Tenant de prueba precargado",
    },
  });

  const membership = await prisma.membership.upsert({
    where: { userId_tenantId: { userId: owner.id, tenantId: tenant.id } },
    update: { status: "ACTIVE" },
    create: { userId: owner.id, tenantId: tenant.id, status: "ACTIVE" },
  });

  const ownerRole = await prisma.role.findFirst({
    where: { key: "owner", isSystem: true, tenantId: null },
  });
  if (ownerRole) {
    await prisma.membershipRole.upsert({
      where: { membershipId_roleId: { membershipId: membership.id, roleId: ownerRole.id } },
      update: {},
      create: { membershipId: membership.id, roleId: ownerRole.id },
    });
  }

  console.log("→ Sembrando productos demo…");
  const demoProducts = [
    { name: "Café molido 250g", priceCents: 4500, stock: 30, sku: "CAF-250" },
    { name: "Café en grano 1kg", priceCents: 16000, stock: 12, sku: "CAF-1K" },
    { name: "Galleta artesanal x6", priceCents: 3500, stock: 50, sku: "GAL-6" },
    { name: "Kit regalo", priceCents: 22000, stock: 8, sku: "KIT-RG" },
  ];

  for (const p of demoProducts) {
    await prisma.product.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: p.sku } },
      update: {},
      create: { ...p, tenantId: tenant.id, currency: "GTQ" },
    });
  }

  console.log("✔ Seed completado");
  console.log("   Login: demo@whatsappia.app / demo1234");
  console.log(`   Tenant: ${tenant.slug}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
