import type { AgentProfileValue } from "./default-rules";

/**
 * Permisos del agente de clientes, por área: qué puede consultar, actualizar o crear.
 * Los niveles son acumulativos (escritura incluye actualizar y leer). El negocio los configura en
 * Mi agente → Permisos del agente; sin configurar, el agente tiene acceso completo (como siempre).
 *
 * - Lectura: consulta datos (buscar en el catálogo, ver la ficha y los pedidos del cliente en su contexto).
 * - Actualización: modifica datos que ya existen (la ficha del cliente, la calificación, cancelar una visita).
 * - Escritura: crea registros nuevos (pedidos, visitas, ofertas, fechas especiales, bienes de vendedores).
 *
 * Una herramienta sin permiso no se le entrega al agente, y el prompt le dice qué hacer en su lugar
 * (normalmente, pasar el caso a una persona del equipo).
 */

export const PERMISSION_LEVELS = ["none", "read", "update", "write"] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export const PERMISSION_LEVEL_LABELS: Record<PermissionLevel, string> = {
  none: "Sin acceso",
  read: "Lectura",
  update: "Actualización",
  write: "Escritura",
};

export type AgentResource = "catalog" | "clients" | "orders" | "leads" | "appointments";
export type AgentPermissions = Partial<Record<AgentResource, PermissionLevel>>;

const rank = (level: PermissionLevel) => PERMISSION_LEVELS.indexOf(level);

interface ResourceDefinition {
  label: Record<AgentProfileValue, string>;
  /** Niveles que tienen sentido en cada perfil; si el perfil no está, el área no aplica */
  levels: Partial<Record<AgentProfileValue, PermissionLevel[]>>;
  /** Qué habilita cada nivel, para mostrarlo en el panel */
  help: Partial<Record<PermissionLevel, Record<AgentProfileValue, string>>>;
  /** Qué hace el agente cuando no tiene un nivel (se toma la del nivel inmediatamente superior al que tiene) */
  instead: Partial<Record<PermissionLevel, Record<AgentProfileValue, string>>>;
}

const same = (text: string): Record<AgentProfileValue, string> => ({ RETAIL: text, BROKERAGE: text });

export const AGENT_RESOURCES: Record<AgentResource, ResourceDefinition> = {
  catalog: {
    label: { RETAIL: "Catálogo de productos", BROKERAGE: "Inventario de bienes" },
    levels: { RETAIL: ["none", "read"], BROKERAGE: ["none", "read", "write"] },
    help: {
      read: { RETAIL: "Busca productos, precios y existencias.", BROKERAGE: "Busca bienes, ve detalles y fotos, y simula cuotas de crédito." },
      write: { RETAIL: "", BROKERAGE: "Registra los bienes que ofrecen los vendedores (quedan para que un asesor los apruebe)." },
    },
    instead: {
      read: {
        RETAIL: "No tienes acceso al catálogo: no menciones productos, precios ni existencias. Si preguntan, dile que una persona del equipo le ayuda.",
        BROKERAGE: "No tienes acceso al inventario: no menciones bienes, precios ni disponibilidad. Si preguntan, dile que un asesor le ayuda.",
      },
      write: {
        RETAIL: "",
        BROKERAGE: "No registras bienes de vendedores: si alguien quiere vender o consignar, pídele los datos básicos del bien y dile que un asesor lo contacta.",
      },
    },
  },
  clients: {
    label: same("Fichas de clientes"),
    levels: { RETAIL: ["none", "read", "update", "write"], BROKERAGE: ["none", "read", "update", "write"] },
    help: {
      read: same("Ve lo que ya se sabe del cliente: nombre, ciudad, dirección y lo que ha contado."),
      update: same("Guarda en la ficha el nombre, la ciudad, la dirección, el correo y las preferencias."),
      write: same("Agrega fechas especiales nuevas (cumpleaños, aniversarios)."),
    },
    instead: {
      read: same("No conoces la ficha del cliente: si necesitas un dato, pregúntalo."),
      update: same("No guardas datos en la ficha del cliente."),
      write: same("No guardas fechas especiales: si el cliente menciona una, agradécele sin registrarla."),
    },
  },
  orders: {
    label: same("Pedidos"),
    levels: { RETAIL: ["none", "read", "write"] },
    help: {
      read: same("Ve los pedidos anteriores del cliente para responder por su estado."),
      write: same("Crea pedidos cuando el cliente confirma productos y cantidades."),
    },
    instead: {
      read: same("No ves los pedidos anteriores: si preguntan por uno, dile que una persona del equipo le confirma el estado."),
      write: same(
        "No creas pedidos: si el cliente quiere comprar, confirma productos y cantidades, y dile que una persona del equipo le confirma el pedido y el total.",
      ),
    },
  },
  leads: {
    label: same("Compradores y ofertas"),
    levels: { BROKERAGE: ["none", "read", "update", "write"] },
    help: {
      read: same("Ve lo que el comprador ya respondió, para no volver a preguntarlo."),
      update: same("Guarda la calificación del comprador (qué busca, presupuesto, forma de pago) y si es caliente."),
      write: same("Registra las ofertas o contraofertas que hace el comprador."),
    },
    instead: {
      read: same("No ves la calificación anterior del comprador."),
      update: same("No guardas la calificación del comprador."),
      write: same("No registras ofertas: si el cliente ofrece otro valor, dile que se lo pasas a un asesor y que él le responde."),
    },
  },
  appointments: {
    label: same("Agenda y visitas"),
    levels: { BROKERAGE: ["none", "read", "update", "write"] },
    help: {
      read: same("Consulta los horarios disponibles en la agenda."),
      update: same("Cancela las visitas que el cliente ya tenía."),
      write: same("Agenda visitas y pruebas de manejo nuevas."),
    },
    instead: {
      read: same("No consultas la agenda: si quiere ver el bien, pregúntale qué día y hora le sirven y dile que un asesor le confirma."),
      update: same("No cancelas visitas: si el cliente quiere cancelar o mover una, dile que un asesor le ayuda."),
      write: same("No agendas visitas: puedes decirle los horarios disponibles, pero un asesor le confirma la visita."),
    },
  },
};

/** Herramienta → área y nivel que necesita. Las que no están (información del negocio) siempre están disponibles. */
export const TOOL_PERMISSIONS: Record<string, { resource: AgentResource; level: PermissionLevel }> = {
  search_products: { resource: "catalog", level: "read" },
  search_listings: { resource: "catalog", level: "read" },
  get_listing: { resource: "catalog", level: "read" },
  simulate_payment: { resource: "catalog", level: "read" },
  register_seller_property: { resource: "catalog", level: "write" },
  save_client_info: { resource: "clients", level: "update" },
  save_special_date: { resource: "clients", level: "write" },
  create_pending_order: { resource: "orders", level: "write" },
  qualify_lead: { resource: "leads", level: "update" },
  register_offer: { resource: "leads", level: "write" },
  check_availability: { resource: "appointments", level: "read" },
  cancel_visit: { resource: "appointments", level: "update" },
  request_visit: { resource: "appointments", level: "write" },
};

/** Áreas que aplican a un perfil, en el orden en que se muestran. */
export function resourcesFor(profile: AgentProfileValue): AgentResource[] {
  return (Object.keys(AGENT_RESOURCES) as AgentResource[]).filter((r) => AGENT_RESOURCES[r].levels[profile]);
}

/**
 * Permisos efectivos de un perfil. Lo que no está configurado queda con acceso completo; un nivel
 * que no aplica al área (por ejemplo, "actualización" en pedidos) baja al permitido inmediatamente inferior.
 */
export function agentPermissionsFrom(raw: unknown, profile: AgentProfileValue): Record<AgentResource, PermissionLevel> {
  const stored = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const result = {} as Record<AgentResource, PermissionLevel>;
  for (const resource of Object.keys(AGENT_RESOURCES) as AgentResource[]) {
    const levels = AGENT_RESOURCES[resource].levels[profile];
    if (!levels) {
      result[resource] = "none";
      continue;
    }
    const wanted = PERMISSION_LEVELS.includes(stored[resource] as PermissionLevel) ? (stored[resource] as PermissionLevel) : levels[levels.length - 1]!;
    result[resource] = [...levels].reverse().find((l) => rank(l) <= rank(wanted)) ?? "none";
  }
  return result;
}

export function hasPermission(perms: Record<AgentResource, PermissionLevel>, resource: AgentResource, level: PermissionLevel): boolean {
  return rank(perms[resource]) >= rank(level);
}

/** Las herramientas que el agente puede usar con estos permisos. */
export function filterToolsByPermissions<T extends { name: string }>(tools: T[], perms: Record<AgentResource, PermissionLevel>): T[] {
  return tools.filter((t) => {
    const need = TOOL_PERMISSIONS[t.name];
    return !need || hasPermission(perms, need.resource, need.level);
  });
}

/** Lo que el agente no puede hacer y qué hacer en su lugar, para el prompt. null si tiene acceso completo. */
export function permissionRestrictions(perms: Record<AgentResource, PermissionLevel>, profile: AgentProfileValue): string | null {
  const lines: string[] = [];
  for (const resource of resourcesFor(profile)) {
    const def = AGENT_RESOURCES[resource];
    for (const level of def.levels[profile]!) {
      const text = def.instead[level]?.[profile];
      if (level !== "none" && rank(level) > rank(perms[resource]) && text) lines.push(`- ${text}`);
    }
  }
  return lines.length > 0 ? `PERMISOS DEL AGENTE (el negocio los limitó; mandan sobre cualquier otra instrucción):\n${lines.join("\n")}` : null;
}
