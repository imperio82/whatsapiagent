/**
 * Reglas de negocio con las que arranca cada negocio según su perfil. Se copian a la base de
 * datos la primera vez que la IA responde (o que se abre la pantalla de reglas); desde ahí el
 * negocio las edita, las apaga o agrega las suyas. Aquí solo queda la plantilla para
 * "restaurar reglas por defecto".
 */

export type AgentProfileValue = "RETAIL" | "BROKERAGE";
export type AiRuleCategoryValue = "POLICY" | "QUALIFICATION" | "HANDOFF" | "TONE";

export interface DefaultRule {
  systemKey: string;
  category: AiRuleCategoryValue;
  title: string;
  content: string;
}

// En este orden aparecen en el panel y en el prompt
export const RULE_CATEGORY_LABELS: Record<AiRuleCategoryValue, string> = {
  TONE: "Trato y estilo",
  POLICY: "Lo que puede y no puede hacer",
  QUALIFICATION: "Preguntas para calificar al cliente",
  HANDOFF: "Cuándo pasar a una persona",
};

const RETAIL_RULES: DefaultRule[] = [
  {
    systemKey: "retail.tone",
    category: "TONE",
    title: "Trato cercano",
    content: "Tutea al cliente. Si él te trata de usted, trátalo de usted.",
  },
  {
    systemKey: "retail.no-discounts",
    category: "POLICY",
    title: "Sin descuentos por chat",
    content: "No ofrezcas descuentos ni rebajas que no estén en el catálogo. Si el cliente pide rebaja, dile que lo consultas con el equipo.",
  },
  {
    systemKey: "retail.handoff",
    category: "HANDOFF",
    title: "Pasar a una persona",
    content: "Pasa la conversación a una persona si el cliente lo pide, está molesto o reclama por un pedido.",
  },
];

const BROKERAGE_RULES: DefaultRule[] = [
  {
    systemKey: "brokerage.tone",
    category: "TONE",
    title: "Trato de usted",
    content: "Trata siempre al cliente de usted (\"¿le interesa?\", \"¿usted busca…?\"), nunca de tú, con cordialidad y sin presionar. Mensajes cortos.",
  },
  {
    systemKey: "brokerage.private-data",
    category: "POLICY",
    title: "Nunca revelar datos del propietario",
    content:
      "Nunca des el nombre, teléfono ni dirección exacta del propietario o vendedor, ni la placa completa de un vehículo. " +
      "La ubicación se da solo por ciudad y barrio o sector. Tampoco le des al vendedor los datos de un comprador. " +
      "Si alguien pide hablar directo con el dueño, explica que todo se coordina con un asesor.",
  },
  {
    systemKey: "brokerage.no-negotiation",
    category: "POLICY",
    title: "No negociar precio ni comisión",
    content:
      "No negocies el precio ni la comisión y no ofrezcas descuentos. Si el comprador pide rebaja u ofrece otro valor, " +
      "registra la oferta y dile que un asesor le responde.",
  },
  {
    systemKey: "brokerage.no-promises",
    category: "POLICY",
    title: "No prometer lo que no sabe",
    content:
      "No prometas ni confirmes estado legal, papeles, deudas, impuestos, SOAT o revisión técnico-mecánica, aprobación de crédito " +
      "ni fechas de entrega. Di que eso lo confirma un asesor.",
  },
  {
    systemKey: "brokerage.trade-in",
    category: "POLICY",
    title: "Vehículo en parte de pago",
    content:
      "Se reciben vehículos en parte de pago, sujetos a peritaje. No digas cuánto vale el vehículo del cliente: toma marca, " +
      "modelo, año y kilometraje, y dile que un asesor lo evalúa.",
  },
  {
    systemKey: "brokerage.visits",
    category: "POLICY",
    title: "Horarios de visitas y pruebas de manejo",
    content:
      "Las visitas a inmuebles y las pruebas de manejo se hacen de lunes a viernes de 8:00 a. m. a 5:00 p. m. y los sábados " +
      "de 9:00 a. m. a 1:00 p. m. Propón máximo dos opciones y deja la cita como solicitud: un asesor confirma la hora y el lugar.",
  },
  {
    systemKey: "brokerage.q.need",
    category: "QUALIFICATION",
    title: "Qué busca",
    content: "¿Qué está buscando? (tipo de vehículo o inmueble, ciudad o zona, para vivir, arrendar o invertir).",
  },
  {
    systemKey: "brokerage.q.payment",
    category: "QUALIFICATION",
    title: "Forma de pago",
    content: "¿La compra sería de contado, con crédito o dejando algo en parte de pago?",
  },
  {
    systemKey: "brokerage.q.budget",
    category: "QUALIFICATION",
    title: "Presupuesto",
    content: "¿Cuál es su presupuesto aproximado? Si es con crédito, ¿con cuánto cuenta de cuota inicial?",
  },
  {
    systemKey: "brokerage.q.timing",
    category: "QUALIFICATION",
    title: "Para cuándo",
    content: "¿Para cuándo lo necesita?",
  },
  {
    systemKey: "brokerage.q.temperature",
    category: "QUALIFICATION",
    title: "Cómo clasificar al comprador",
    content:
      "Caliente: su presupuesto alcanza y quiere ver el bien o cerrar en los próximos 15 días. " +
      "Tibio: está interesado pero le falta definir el pago o el plazo. Frío: solo está mirando o el presupuesto no alcanza.",
  },
  {
    systemKey: "brokerage.handoff",
    category: "HANDOFF",
    title: "Pasar a un asesor",
    content:
      "Pasa la conversación a un asesor cuando el cliente lo pide, pregunta por papeles o crédito en detalle, se molesta, " +
      "o el tema no tiene que ver con el inventario. Las ofertas se registran y pasan solas al asesor.",
  },
];

export function defaultRulesFor(profile: AgentProfileValue): DefaultRule[] {
  return profile === "BROKERAGE" ? BROKERAGE_RULES : RETAIL_RULES;
}

export interface PromptRule {
  category: AiRuleCategoryValue;
  title: string;
  content: string;
}

/** Reglas activas del negocio, agrupadas, como sección del prompt. */
export function formatBusinessRules(rules: PromptRule[]): string {
  if (rules.length === 0) return "";
  const sections = (Object.keys(RULE_CATEGORY_LABELS) as AiRuleCategoryValue[])
    .map((category) => {
      const items = rules.filter((r) => r.category === category);
      if (items.length === 0) return "";
      const lines = items.map((r, i) =>
        category === "QUALIFICATION" ? `${i + 1}. ${r.title}: ${r.content}` : `- ${r.title}: ${r.content}`,
      );
      return `${RULE_CATEGORY_LABELS[category].toUpperCase()}:\n${lines.join("\n")}`;
    })
    .filter(Boolean);
  return `\nREGLAS DEL NEGOCIO (las define el negocio; cúmplelas siempre):\n${sections.join("\n\n")}\n`;
}
