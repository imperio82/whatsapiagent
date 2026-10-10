# Guion: video para Meteor (Implementador de Agentes IA) · máx. 8 min, sin editar

Meteor hace agentes de IA ("Mets") que atienden por WhatsApp y ejecutan tareas operativas (ERP, stock, publicar
contenido), con CRM, flujos y un servidor MCP. Clientes: pymes, e-commerce y **distribuidores** en Colombia.
Tus proyectos encajan casi uno a uno: whatsAppia (agente conversacional), Content Ops Agent (agente operativo con MCP)
y distrib-mvp (distribución + DIAN).

**Regla de oro:** solo métricas reales. Donde dice [COMPLETAR], pon el dato verdadero o dilo sin número.

---

## 0:00 – 0:30 · Presentación (cámara)
"Hola, soy Jhon Anderson García, desarrollador full stack en Colombia. Construyo agentes de IA que atienden clientes
y ejecutan tareas en los sistemas del negocio. Les voy a mostrar dos logros funcionando y dos problemas difíciles que resolví."

## 0:30 – 2:45 · Logro 1: whatsAppia, agente que vende por WhatsApp (pantalla)
**Mostrar en vivo:**
1. Antes de grabar: `npm run db:seed:demo` (deja el catálogo de ropa con su stock inicial).
   Por WhatsApp (número de prueba): "¿tienen jean de hombre talla 32?" → "¿cuánto vale el envío a Pereira?" →
   "mándame el jean y 2 camisetas negras talla M" → "agrégame 3 camisetas negras XL" (solo hay 1: lo dice sin inventar).
2. El pedido aparece en el panel con su código (PED-0001) y el stock ya descontado.
3. En la terminal, `npx tsx --env-file=.env scripts/probar-agente.ts`: se ve la **traza** de cada turno
   (router → especialista → herramientas con sus argumentos → verificador) y los tokens.
4. Abre `src/modules/ai/infrastructure/graph/sales-graph.ts` y muestra el diagrama del comentario de arriba.
5. **Memoria:** en otra conversación el cliente dice "soy Laura, vivo en Pereira, Cra 8 # 12-30, uso talla M"; luego
   escribe "¿ya despacharon mi pedido? quiero otra igual pero blanca, a la misma dirección" y el agente responde sin
   volver a preguntar nada (sabe su dirección, su talla y el estado de su pedido anterior).

**Qué decir:**
- Problema: el negocio pierde ventas porque no responde WhatsApp a tiempo.
- Arquitectura: grafo multiagente con **LangGraph**: un **router** clasifica la intención (ventas, pedido,
  info o humano); cada **especialista** tiene solo sus herramientas; un **verificador en código fijo** revisa que
  cada precio y código de pedido venga de una herramienta. Si falla, reintenta una vez con la corrección; si vuelve
  a fallar, pasa a una persona y pausa la IA en esa conversación.
- "El agente razona y el flujo hace lo que no puede fallar": la reserva de stock y el consecutivo del pedido van en
  una transacción con descuento condicional.
- Proveedor intercambiable (Gemini u OpenAI). Elegí Gemini *flash-lite* porque en mis pruebas el modelo grande
  tardaba 20–40 s por llamada y *lite* menos de 1 s: en WhatsApp la velocidad es parte de la calidad.
- Trazabilidad: cada turno guarda la intención, la traza y el costo estimado.
- Memoria tipo CRM: el agente guarda nombre, ciudad, dirección y preferencias en la ficha del cliente; llena los campos
  vacíos y no sobrescribe lo que escribió una persona. Ve los últimos pedidos para responder "¿ya despacharon?".
- Mi aporte: diseño y desarrollo completo (yo solo).

## 2:45 – 4:45 · Logro 2: Content Ops Agent, agente operativo con MCP (pantalla)
**Mostrar en vivo:** pides un tema → el agente investiga, redacta, queda para aprobación → se publica en WordPress.

**Qué decir:**
- Problema: producir contenido SEO cada semana toma horas.
- Arquitectura: LangGraph (flujo por pasos con estado), MCP para conectar herramientas, API REST de WordPress.
- Revisión humana antes de publicar ("la IA propone, la persona aprueba").
- Resultado: [COMPLETAR: tiempo por artículo antes y después, o artículos publicados].
- Conexión con Meteor: es lo mismo que un Met operativo que publica contenido; y ya trabajo con MCP, que ustedes exponen con 115 herramientas.

## 4:45 – 6:15 · Situación compleja 1: pedidos simultáneos y stock (distrib-mvp)
**Mostrar:** `create-order.use-case.ts`, `prisma-order.repository.ts` (`decrementStock` con condición) y correr `npx vitest run` en vivo (69 pruebas en verde).

**Qué decir:**
- Problema: dos vendedores (o el agente de WhatsApp y un vendedor) piden las últimas unidades al mismo tiempo → stock negativo y números de pedido repetidos.
- Solución: todo en una transacción; el UPDATE de stock solo descuenta si alcanza (`stock >= cantidad`) y el consecutivo bloquea la fila de la empresa.
- Verificación: pruebas automáticas (69 en el proyecto) y prueba real contra la base: 3 pedidos simultáneos → solo pasa uno, sin stock negativo ni números repetidos.

## 6:15 – 7:30 · Situación compleja 2: facturación DIAN por empresa (distrib-mvp)
**Mostrar:** pantalla de superadmin de facturación electrónica y el módulo `billing` (sin mostrar credenciales).

**Qué decir:**
- Problema: todas las empresas facturaban con la misma cuenta de Factus (riesgo legal y de seguridad).
- Solución: credenciales por empresa cifradas con AES-256-GCM, flujo de solicitud → configuración → prueba de conexión → activación, y consulta del adquiriente en la DIAN.
- Resultado: probado en el sandbox de Factus; cada empresa factura con su propia cuenta.
- (Alternativa si prefieres: reducción de costos de LLM en Ktarsys ajustando prompts y modelos [COMPLETAR: % o valor].)

### Alternativa recomendada para la situación 2: el pedido que se creaba dos veces (whatsAppia)
**Mostrar:** la traza de `scripts/probar-agente.ts` y el bloque `previousOrder` en `sales-graph.ts`.

**Qué decir:**
- Problema: al probar la memoria, el verificador rechazó una respuesta con un total inventado ($65.000 = $50.000 + un
  envío estimado) y pidió reintentar; en el reintento el agente volvió a llamar `create_pending_order` y el pedido
  quedó **duplicado**.
- Cómo lo detecté: con la traza de cada turno (qué herramienta, con qué argumentos) y revisando los pedidos en la base.
- Solución: las acciones que crean datos son **idempotentes dentro del turno**: si el pedido ya se creó, el reintento
  recibe el mismo resultado y no se crea otro. El verificador sí sirvió: frenó el precio inventado.
- Lección: los reintentos automáticos de un agente solo son seguros si las acciones con efectos no se repiten.

## Hablar el idioma de Meteor (de su página)
- **Su proceso de 8 pasos:** diagnóstico → canales → flujos → entrenamiento de IA (catálogo, tono, respuestas clave) →
  integraciones → pruebas → lanzamiento → optimización mensual con datos. Cuenta whatsAppia siguiendo esos pasos.
- **Su principio:** "el Met razona y el flujo repite los pasos que no pueden fallar (cobrar, despachar, notificar)".
  Tú hiciste lo mismo: el agente arma el pedido, pero el stock y el consecutivo los maneja código determinista en una
  transacción. **Dilo con esas palabras.**
- **Su regla en TCC:** "el precio siempre viene de TCC; si no responde, la cotización se detiene". Igual a tu guardrail:
  el precio y el stock siempre salen de las herramientas, nunca del modelo.
- **Trazabilidad:** ellos muestran qué herramienta llamó el Met, con qué parámetros y su costo. En el logro 1 muestra
  las llamadas a herramientas del agente y, si lo tienes, el costo por conversación (`pricing.ts` de whatsAppia).
- **Contexto colombiano:** integran Siigo, Alegra, Wompi, TCC, WooCommerce y atienden distribuidores. Menciona que ya
  integraste factura DIAN (Factus) y trabajas con distribuidoras.

## Requisitos de la vacante que el video debe cubrir
| Requisito | Dónde se ve |
|---|---|
| IA, agentes, LLMs y automatización | Logros 1 y 2 |
| Programación, APIs e integraciones | WhatsApp, WordPress, Factus/DIAN, pruebas en vivo |
| **UX/UI y Figma** | Ver bloque "UX/UI" abajo (≈30 s dentro del logro 1 o antes del cierre) |
| **Claude, ChatGPT y MCPs** | Mencionar que construí estos proyectos con Claude Code a diario; OpenAI y Gemini en whatsAppia; MCP en Content Ops |
| Autonomía y resultados | "Lo diseñé y construí yo solo, de la idea a producción" |

### UX/UI (≈30 s)
**Mostrar:** el panel principal de distrib-mvp (tarjetas que llevan a cada sección, resumen de pedidos, últimos pedidos
a un lado) y la pantalla del vendedor en el celular.
**Qué decir:** "Diseño pensando en quién lo usa: el dueño abre el panel y en 30 segundos sabe qué pedidos llegaron y qué
clientes está perdiendo; el vendedor tiene una vista móvil simple." Si tienes diseños en **Figma**, muéstralos 10 segundos.
Si no los tienes, **no digas que usas Figma**: di que diseñas directamente con componentes (Tailwind, shadcn/ui) y que
puedes trabajar a partir de diseños de Figma.

## 7:30 – 8:00 · Cierre (cámara)
"Mi forma de trabajar: entiendo el proceso del negocio, elijo la herramienta más simple que lo resuelva, pongo
guardrails y lo verifico con pruebas y datos reales. Trabajo a diario con Claude, ChatGPT y MCPs, y me gustaría hacer
esto con los clientes de Meteor, sobre todo distribuidores y e-commerce, donde ya tengo experiencia. Gracias."

---

## Antes de grabar
- [ ] Probar que whatsAppia y el Content Ops Agent funcionen (hacer la demo completa 2 veces).
- [ ] **Ocultar secretos:** no abrir `.env`, ni mostrar API keys, URLs de base de datos o credenciales de Factus.
- [ ] No mostrar código ni datos de NetVoz / Innodrive ni de sus clientes.
- [ ] Datos de prueba cargados (productos, clientes).
- [ ] Pestañas y archivos abiertos en orden; letra del editor grande; notificaciones de Windows apagadas.
- [ ] Ensayar con cronómetro (si pasa de 8 min, recortar la situación 2).
- [ ] Grabar con OBS (pantalla + cámara en una esquina) o con la grabadora de Windows (Win + Alt + R).
- [ ] Subir a YouTube como **no listado** y probar el link en una ventana de incógnito.

## Mensaje para enviar el link
> Hola, equipo de Meteor. Muchas gracias por la oportunidad. Aquí está mi video para la vacante de Implementador de
> Agentes IA: [LINK]. En él muestro funcionando un agente de ventas por WhatsApp y un agente operativo con MCP, y dos
> problemas técnicos que resolví en un sistema para distribuidoras. Quedo atento. Saludos, Jhon Anderson García Calvo.
