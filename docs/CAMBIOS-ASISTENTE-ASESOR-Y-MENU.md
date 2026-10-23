# Cambios: asistente del asesor por WhatsApp, reglas de la IA y menú lateral

Fecha: 2026-10-21 / 2026-10-23 · Rama: `feat/perfil-intermediacion` · Sin commit todavía.

## 1. Asistente del asesor por WhatsApp

Cuando un miembro del equipo le escribe al número del negocio desde su WhatsApp, el mensaje **no** se trata como un cliente nuevo: lo atiende un asistente interno que consulta y actualiza el CRM.

### Cómo se activa

1. Ir a **Configuración → Equipo**.
2. En la columna **WhatsApp** de cada miembro, poner su número (con indicativo, ej. `573001234567`). Se edita en la misma fila.
3. El interruptor **"Asistente del asesor por WhatsApp"** (arriba en esa página) lo prende o apaga para todo el negocio. Viene encendido por defecto.

También se reconoce el número de avisos del dueño (`ownerNotifyPhone`).

### Qué puede hacer el asesor

| Para todos los negocios | Solo intermediación (inmobiliaria / vehículos) |
| --- | --- |
| Resumen del día | Ver agenda (hoy, mañana, semana, por confirmar) |
| Listar compradores / leads por temperatura o tipo | Confirmar, mover, cancelar o marcar realizada una cita (se sincroniza con el calendario) |
| Ficha de un cliente con sus últimos mensajes | Buscar en el inventario con datos privados del propietario |
| Cambiar temperatura, etapa o agregar nota interna | Aprobar, reservar, marcar vendido o archivar un bien |
| Ver conversaciones esperando a una persona | Ver y enviar/descartar coincidencias |
| Escribirle a un cliente (pide confirmación antes de enviar) | |
| Reactivar la IA en una conversación | |

### Reglas de seguridad del asistente

- **No inventa horas**: si el cliente pidió "el jueves en la mañana", pregunta la hora exacta antes de confirmar la cita.
- **No escribe a clientes sin permiso**: muestra el texto exacto y solo lo envía cuando el asesor confirma. Al enviar, pausa la IA en esa conversación por 2 horas.
- Si un nombre coincide con varios clientes, pregunta cuál. La búsqueda ignora tildes y mayúsculas.

### Archivos

- `src/modules/ai/application/advisor-assistant.use-case.ts`: reconoce al asesor y le responde.
- `src/modules/ai/infrastructure/advisor-tools.ts`: herramientas del asistente.
- `src/modules/ai/infrastructure/graph/langchain-provider.ts`: proveedor de IA nuevo (ver nota técnica).
- `src/modules/ai/domain/advisor-phone.ts` (+ test): comparación de números.
- `src/modules/whatsapp/infrastructure/provider-bootstrap.ts`: desvía los mensajes del equipo al asistente.
- `src/modules/users/application/update-member-phone.use-case.ts`, `app/api/v1/team/[id]/route.ts`, `services/team.service.ts`: guardar el WhatsApp de cada miembro.
- `app/(dashboard)/configuracion/equipo/page.tsx`: columna WhatsApp e interruptor.

### Base de datos

Migración `prisma/migrations/20261021000000_advisor_assistant/`:

- `tenants.advisorAssistant` (boolean, por defecto `true`).
- `memberships.whatsappPhone` (texto, único por negocio).

Ya aplicada en local. En Railway se aplica sola al desplegar.

### Nota técnica

El proveedor antiguo de Gemini (`@google/generative-ai`) falla con herramientas en los modelos actuales (`Role 'function' is not supported`), y `gemini-flash-latest` respondía 503 por demanda. El asistente usa `LangChainProvider`, con el mismo modelo y cliente del agente de clientes (`GEMINI_GRAPH_MODEL`). El costo se registra en `ai_usage_logs` con `intent = "advisor"`.

### Limitaciones

- El historial vive en memoria: se pierde tras 3 horas sin mensajes o al reiniciar el servidor.
- Estas charlas no aparecen en el panel de Conversaciones.
- Si WhatsApp entrega al asesor como `@lid` (sin número visible), no se le reconoce.
- Solo lee mensajes de texto.
- Con Meta Cloud API, escribir a un cliente solo funciona dentro de la ventana de 24 horas.

## 2. Reglas de la IA en pestañas y cuadrícula

`app/(dashboard)/configuracion/ia/reglas/page.tsx`

- Una pestaña por tipo de regla (Trato y estilo, Lo que puede y no puede hacer, Preguntas para calificar al cliente, Cuándo pasar a una persona), una al lado de la otra, con el conteo de activas (ej. `3/4`).
- Las reglas de la pestaña elegida se ven como tarjetas: 1 columna en celular, 2 en tablet, 3 en pantalla ancha.
- Cada tarjeta tiene interruptor, editar y eliminar. Al final hay una tarjeta "Nueva regla".
- El botón "Nueva regla" de arriba crea la regla en la pestaña abierta.

## 3. Menú lateral

`components/layout/sidebar.tsx`, `components/layout/sidebar-state.ts` (nuevo), `components/layout/topbar.tsx`

- Cada sección se pliega y despliega con su título.
- Por defecto quedan abiertas **Operación** (Conversaciones) y **Catálogo** (Productos / Inventario); las demás plegadas. La sección de la página actual siempre se abre.
- Botón en la barra superior (a la izquierda del buscador) para **esconder o mostrar todo el menú**, con animación deslizante.
- El navegador recuerda las secciones abiertas y si el menú quedó escondido.
- En celular el menú lateral sigue oculto, como antes; el botón solo aparece en pantallas medianas y grandes.

## Verificación

- `npx tsc --noEmit`: sin errores.
- `npm test`: 45 pruebas, 0 fallas.
- Asistente probado de punta a punta con el negocio demo y un WhatsApp simulado (resumen, compradores calientes, citas, confirmar cita pidiendo la hora, borrador de mensaje con confirmación).
- Pendiente: revisar visualmente las páginas en el navegador.
