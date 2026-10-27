# Pendientes

Lo que quedó por hacer al 26 de octubre de 2026. Rama de trabajo: `feat/perfil-intermediacion`. Producción despliega desde `main`, en Railway.

## 1. Urgente: la IA no responde por falta de créditos

- [ ] **Recargar los créditos de Gemini.** Google responde `402 Your prepayment credits are depleted`. Agregar el método de pago no basta: también hay que **comprar créditos** (o pasar a facturación pospago) en Google AI Studio → *Billing*, en el mismo proyecto de la clave `GEMINI_API_KEY`.
- [ ] Revisar que la clave de Railway sea la del proyecto que tiene saldo (la clave local termina en `…XFnU`).
- [ ] Elegir el modelo en `/plataforma` → *Modelo del agente*. Recomendado: `gemini-2.5-flash-lite`, que tiene versión fija y es el más barato. Al guardar se hace una prueba; si no hay saldo, no se cambia.
- [ ] Probarlo en el simulador (*Configuración → Simulador*). Debe responder en pocos segundos, sin el aviso "El agente no respondió".

## 2. Unir a `main` lo que está en la rama sin desplegar

Hacerlo **después del punto 1**, cuando la IA ya responda:

| Commit | Qué hace |
|---|---|
| `66295f3` | Registra en los logs los reintentos de la IA (`[ai] … falló (status), se reintenta`) y baja los reintentos de 6 a 3, para que un turno no se quede esperando minutos. También arregla el aviso del simulador cuando la respuesta llega tarde. |
| `8879bf5` | Ordena el prompt: primero lo que no cambia (negocio, reglas) y al final lo de cada turno (fecha, cliente). Así Gemini reutiliza su caché, que es más barata y más rápida. Quita el `id` interno de los inmuebles y vehículos que ve el agente. |

- [ ] Hacer el merge `feat/perfil-intermediacion` → `main` y `git push`.
- [ ] En los logs de Railway, confirmar que aparece `tokensIn=X (en caché N)` y que **N es mayor que 0** desde el segundo mensaje de una conversación. Si queda en 0, la caché implícita no está funcionando y hay que revisar el orden del prompt.

## 3. Base de datos local

- [ ] Aplicar en local las migraciones que ya están en producción. El comando lo bloqueó el clasificador, así que hay que correrlo a mano:
  ```
  npx prisma migrate deploy
  ```
  Las migraciones son `20261025100000_ai_reply_delay`, `20261025200000_agent_personality`, `20261025300000_reminders`, `20261026000000_agent_permissions`, `20261026100000_visit_confirmation_skill`, `20261026200000_platform_settings` y `20261027100000_usage_limits`.

## 4. Dominio y nombre de la marca

- [x] Elegir el nombre: **Atiendo IA**. La marca no puede contener "WhatsApp", "Whats" ni "wa", porque Meta lo prohíbe. Ya cambiado en la app.
- [ ] Confirmar la disponibilidad en el registrador y comprar `atiendoia.com`: el dominio principal para la landing (`F:\projectsme\atiendoia-web`) y `app.atiendoia.com` para la app.
- [ ] Buscar el nombre en la SIC (Colombia) y registrar la marca.
- [ ] Conectar el dominio a Railway:
  - [ ] *Settings → Networking → Custom Domain* en Railway, y el `CNAME` que indique Railway en el DNS del registrador.
  - [ ] Actualizar `AUTH_URL` y `NEXT_PUBLIC_APP_URL` con el dominio nuevo.
  - [ ] En Meta (*WhatsApp → Configuración*), cambiar la URL del webhook a `https://<dominio>/api/v1/whatsapp/webhook`. Hoy apunta a la URL de Railway. Si se usa Twilio, su webhook es `/api/v1/whatsapp/twilio/webhook`.
  - [ ] Si se usa el login o la integración con Google, agregar el dominio nuevo a las URIs de redirección autorizadas en Google Cloud.
- [x] Cambiar el nombre visible "whatsAppia" por "Atiendo IA" en la interfaz y el título de la página.

## 5. Límites de uso (docs/Límites de uso, alertas y recarga – Atiendo IA.pdf)

**Hecho (fase 1, medir):**
- Cupos y topes nuevos en `plans.ts`: Emprende 500 clientes y US$10; Pro 1.100 y US$23; Negocio 2.200 y US$45. Precio del cliente adicional: $300, $280 y $260. La landing ya tiene los cupos nuevos.
- `puedeResponder` (`canRespond` en `billing/application/response-gate.ts`) decide antes del router si la respuesta va con IA, con gracia o en espera:
  - Gracia: 48 h para los chats abiertos.
  - Espera: mensaje fijo sin IA, y el chat pasa al equipo.
  - Tope por contacto: 40 respuestas de IA al mes.
  - El simulador no cuenta para el cupo.
- Interruptor en `/plataforma` → *Límites de uso*:
  - **Solo registro** (por defecto): anota en los logs `[limites] … (solo registro, no se aplica)` y deja el freno anterior.
  - **Activo**: aplica la gracia y el mensaje de espera.
- Panel con las métricas del documento:
  - costo de IA por cliente
  - peso de la IA sobre el ingreso
  - negocios en el tope
  - clientes en espera
  - contactos con 40 o más respuestas
- El costo descuenta los tokens en caché, que se cobran al 25 % del precio de entrada.

**Falta:**
- [ ] Revisar 2 a 4 semanas de uso real en modo solo registro y ajustar cupos y precios. Después, pasar a **Activo**.
- [ ] Fase 2, avisar:
  - [ ] avisos al dueño al 70 % y al 90 % (banner, WhatsApp de avisos y correo, una vez por mes)
  - [ ] aviso diario de los clientes en espera
  - [ ] retomar con un mensaje de disculpa los chats de las últimas 24 h cuando el dueño recarga
- [ ] Fase 3, cobrar:
  - [ ] elegir la pasarela de pago
  - [ ] paquetes de recarga en clientes (100, 250 y 500), con vigencia de 60 días
  - [ ] auto-recarga, máximo 3 al mes
  - [ ] sugerencia de plan mayor
  - [ ] cambio de plan con prorrateo
  - Hoy la única recarga es el botón *Crédito*, en dólares.
- [ ] El cupo se reinicia el 1 de cada mes. El documento pide reiniciarlo el día de corte del plan.

## 6. Revisar

- [ ] **Recordatorios y la ventana de 24 horas de Meta.** Los recordatorios de cita, seguimiento y libres se envían como texto libre. Con la API de Meta, si el cliente lleva más de 24 horas sin escribir, el mensaje **no se entrega** a menos que use una plantilla aprobada. Lo más expuesto son los recordatorios de cita: alguien que agendó hace días no escribe desde entonces. Opciones:
  1. Crear plantillas aprobadas en Meta para recordatorio de cita y seguimiento, y usarlas cuando la ventana esté cerrada.
  2. Como mínimo, mostrarle al asesor que el mensaje no salió.
- [x] **Costo con caché.** Confirmada en producción: entre el 55 % y el 65 % de la entrada sale de la caché. Ahora se guarda `cachedTokensIn` y se descuenta del costo.

## 7. Ahorro de tokens que quedó sin hacer

No se hizo para no afectar la calidad de las respuestas. Primero hay que armar una prueba (eval) con conversaciones reales para comparar antes y después.

- [ ] Acortar las descripciones de las herramientas. Los esquemas suman unos 2.400 tokens por llamada en el especialista comprador.
- [ ] Recortar el historial de la conversación que se envía en cada turno.

## 8. Opcional

- [ ] Hacer commit de `docs/datos-prueba/`: Excel y CSV de prueba para la inmobiliaria.
- [ ] Completar las variables de entorno que faltan: ver [VARIABLES-ENTORNO-PENDIENTES.md](VARIABLES-ENTORNO-PENDIENTES.md).
