# Demo: intermediación de vehículos e inmuebles

Perfil de agente `BROKERAGE` para negocios que conectan compradores y vendedores de carros y casas.
Se activa por negocio en **Configuración → IA → Tipo de negocio**.

## Qué hace

| Lo que pidió el cliente | Dónde está |
|---|---|
| Responde al instante con el inventario real (precio, km, área, barrio, fotos) | `search_listings`, `get_listing` |
| Califica al comprador (qué busca, forma de pago, presupuesto, plazo) y lo marca caliente/tibio/frío | `qualify_lead` + reglas `QUALIFICATION` |
| Nunca da datos del propietario | la IA no los recibe + el verificador bloquea teléfonos de terceros |
| No negocia: registra la oferta y pasa la conversación a un asesor | `register_offer` (pausa la IA 2 h) |
| Deja la visita o prueba de manejo como solicitud; el asesor confirma | `request_visit` → página **Citas** |
| Recibe a los vendedores y deja el bien pendiente de aprobación | `register_seller_property` → **Inventario → Por aprobar** |
| Avisa al dueño por WhatsApp: comprador caliente, oferta, visita, bien nuevo | `ownerNotifyPhone` del negocio |
| Reglas editables sin tocar código | **Configuración → Reglas de la IA** (tabla `ai_rules`) |

Las instrucciones técnicas de cada herramienta siguen en el código (`src/modules/ai/infrastructure/graph/profiles.ts`);
las reglas de negocio (qué puede decir, cómo calificar, cuándo pasar a una persona, el trato) viven en la base de
datos y el negocio las edita. Las por defecto están en `src/modules/ai/domain/default-rules.ts`.

## Preparar la demo

```bash
npm run db:seed                                   # roles y permisos (una vez)
npm run db:seed:intermediacion -- --notify=57TU_NUMERO
```

Crea el negocio ficticio **Eje Autos & Hogar** con 13 bienes (fotos ilustrativas de Unsplash), 12 reglas,
5 compradores/vendedores, una cita por confirmar y la conversación del ejemplo de la propuesta. Entra con
`demo@whatsappia.app / demo1234` (o el usuario de `--email=`) y cambia a ese negocio. Cada corrida deja la demo
en su estado inicial.

## Ensayar sin WhatsApp

```bash
npx tsx --env-file=.env scripts/probar-intermediacion.ts             # comprador, vendedor y arriendo
npx tsx --env-file=.env scripts/probar-intermediacion.ts vendedor
```

Pasa cada mensaje por el mismo camino que uno real (reglas de la base de datos, grafo, verificador) e imprime
lo que se enviaría, los avisos al dueño y cómo queda el CRM. Espera 15 s entre mensajes por el límite del plan
gratis de Gemini (`--pausa=0` para quitarlo).

## Guion sugerido (10 minutos)

1. Panel: **Inventario** (mostrar el bloque de datos privados), **Compradores**, **Citas**.
2. Desde el celular del cliente al número de la demo:
   - "Buenas, ¿sigue disponible la camioneta?" → lista con precios reales.
   - "La Mazda, ¿se puede financiar?" / "Crédito, tengo 30 millones de inicial" → califica.
   - "¿Me pasa el número del dueño?" → no lo da y sigue atendiendo.
   - "Quiero verla el jueves en la mañana" → cita por confirmar + aviso al dueño.
   - "¿Me la deja en 90 millones?" → registra la oferta, avisa y la IA se calla.
3. Mostrar el aviso que llegó al WhatsApp del dueño y el lead caliente en el panel.
4. **Reglas de la IA**: cambiar una regla en vivo (por ejemplo, el horario de visitas) y volver a preguntar.
5. Desde otro número: "Quiero vender mi carro" → aparece en **Inventario → Por aprobar**.

## Pendiente (Plan Completo de la propuesta)

- Seguimiento automático a quien no volvió, alertas de coincidencias a compradores anteriores, resumen diario
  y recordatorio de la cita el día anterior (necesitan un programador de tareas y plantillas aprobadas por Meta).
- Recibir fotos del vendedor dentro del registro del bien (hoy llegan al chat y el asesor las adjunta).
- Producción con la API oficial (Fase 1 del plan): la demo puede correr con Baileys en un número de prueba,
  nunca en el número real del cliente.
