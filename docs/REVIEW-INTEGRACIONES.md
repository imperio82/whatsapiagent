# Review: tipo de negocio en el registro, Google Calendar, importación de datos y felicitaciones

**Fecha:** 15 de octubre de 2026 (actualizado el 16 de octubre: calendario por asesor y credenciales de Google por negocio)
**Rama:** `feat/perfil-intermediacion`
**Estado:** construido y probado, **sin commit**. El último commit en GitHub es `4245a1a`, el perfil de intermediación. Nada de este documento está subido todavía.

Este documento resume qué se hizo, cómo se probó, qué falta y qué limitaciones conocidas hay, para retomarlo después.

---

## 1. Qué se hizo

### 1.1 Tipo de negocio desde el registro

- **Registro (`/register`).** Lo primero es "¿Qué tipo de negocio es?", con dos opciones: **Tienda** o **Intermediación** (vehículos e inmuebles). Los ejemplos del formulario cambian según la opción.
- **Al crear la cuenta:**
  - El negocio queda con su `agentProfile`.
  - Se cargan sus reglas de IA: 12 para intermediación y 3 para tienda.
  - Si no se elige nada, queda como tienda.
- **Inicio (`/`).**
  - La tienda ve lo mismo de antes: ventas, pedidos y chats.
  - La intermediación ve otro inicio:
    - Contadores de coincidencias por aprobar, bienes por aprobar, visitas pendientes y compradores calientes.
    - Las próximas visitas y los chats nuevos.
    - Si el negocio aún no tiene inventario, una caja de "primeros pasos".
- El tipo se puede cambiar después en **Configuración → IA**.

**Archivos principales:**

| Qué | Archivo |
|---|---|
| Formulario de registro | `components/features/auth/register-form.tsx` |
| Validación del registro | `src/modules/auth/interface/auth.controller.ts` |
| Caso de uso del registro | `src/modules/auth/application/register-tenant.use-case.ts` |
| Inicio de cada tipo de negocio | `app/(dashboard)/page.tsx` |

### 1.2 Integraciones modulares y Google Calendar para el agente

**Diseño.** El agente no conoce a Google. Hay dos "puertos": `CalendarProvider` y `SpreadsheetProvider`. Un registro decide qué proveedor conectado cumple cada capacidad. Google es la primera implementación. Para sumar otro proveedor (Outlook, Calendly…) hay que:

1. Implementar el puerto.
2. Agregarlo a `catalog.ts`, al enum `IntegrationProvider` y a `registry.ts`.

| Pieza | Archivo |
|---|---|
| Puertos | `src/modules/integrations/domain/ports/*.ts` |
| Agenda: días, horario, espacios libres, zona horaria | `src/modules/integrations/domain/agenda.ts`, con pruebas |
| Catálogo de proveedores | `src/modules/integrations/domain/catalog.ts` |
| OAuth de Google: consentimiento, canje, renovación y revocación | `src/modules/integrations/infrastructure/google/google-auth.ts` |
| Calendar y Sheets por REST con `fetch`, sin SDK | `src/modules/integrations/infrastructure/google/google-calendar.ts`, `google-sheets.ts` |
| `state` de OAuth firmado con HMAC, más un nonce en cookie | `src/modules/integrations/infrastructure/oauth-state.ts`, con pruebas |
| Registro de proveedores | `src/modules/integrations/infrastructure/registry.ts` |
| Servicio de agenda: espacios, agendar o mover, sincronizar desde el panel | `src/modules/integrations/application/scheduling.service.ts` |
| API | `app/api/v1/integrations/**` |
| Pantalla | `app/(dashboard)/configuracion/integraciones/page.tsx` |
| Guía para crear las credenciales de Google | `docs/INTEGRACION-GOOGLE.md` |

**Lo que hace el agente de intermediación (nuevas herramientas):**

- `check_availability(day)`: espacios libres del día y, si hay pocos, de los días siguientes.
- `request_visit(listing, dateTime?)`:
  - Con `dateTime` y calendario conectado, crea el evento y deja la cita **CONFIRMADA**.
  - Si el horario está ocupado, devuelve alternativas.
  - Si no hay calendario, o si falla, queda como solicitud y un asesor confirma.
  - También mueve una cita existente, sin duplicarla.
- `cancel_visit(listing)`: cancela la cita y borra el evento.
- La regla 6 del agente comprador (`graph/profiles.ts`) se actualizó para usar este flujo.

**Lo que se ve en el panel:**

- **Citas:** confirmar, mover o cancelar se refleja en el calendario. Cada cita muestra el enlace "En el calendario". Si Google falla, la cita igual se guarda y sale un aviso.
- **Integraciones:**
  - Conectar o desconectar Google.
  - Elegir el calendario, los días y el horario de visitas, la duración de cada cita y la anticipación mínima.
- **El evento** lleva cliente, teléfono, bien, propietario y dirección exacta. Es para el equipo; el cliente no lo ve.

### 1.2.1 Calendario propio de cada asesor y credenciales de Google por negocio (16 de octubre)

**Nada de Google es compartido entre negocios.**

**Tres niveles:**

- **Credenciales de la app (Client ID y Secret):**
  - Cada negocio puede cargar las suyas en Integraciones → *Credenciales de Google*. Se guardan cifradas en la tabla `integration_apps`.
  - Las del `.env` quedan solo como respaldo de la plataforma.
  - Si el negocio cambia sus credenciales, todas sus conexiones pasan a "Hay que reconectar", porque Google amarra los tokens a las credenciales.
- **Cuenta de Google del negocio** (`ownerKey = "business"`): para Google Sheets y como calendario compartido.
- **Calendario de cada asesor** (`ownerKey = "user:<id>"`):
  - Cada usuario conecta el suyo en *Mi calendario*.
  - Elige su calendario, horario, duración y anticipación.
  - Tiene un interruptor **Recibir visitas** (para vacaciones, por ejemplo).

**Reparto de visitas:**

- Si hay asesores con calendario y que reciben visitas, se ofrece un horario cuando al menos uno está libre.
- La cita se asigna al libre con **menos citas próximas**.
- Si se mueve y su asesor sigue libre, se queda con él; si no, pasa al calendario de otro: se borra el evento del primero y se crea en el del segundo.
- Si nadie tiene calendario, se usa el del negocio. Si tampoco hay, queda como solicitud.
- Un asesor inactivo en el negocio no recibe citas.

**Dónde se ve:**

- El agente le dice al cliente con quién quedó la cita, y el aviso al dueño dice qué asesor la atiende.
- **Citas** muestra "La atiende X".
- **Integraciones** muestra cuatro secciones: *Mi calendario*, *Cuenta de Google del negocio*, *Calendarios del equipo* (quién tiene el suyo y quién recibe visitas) y *Credenciales de Google* (con el URI de redirección para copiar).

**Permisos:**

- Conectar la cuenta del negocio y cambiar las credenciales exige `tenant.settings`.
- Conectar el calendario propio solo exige ser miembro activo.
- El `state` de OAuth firmado lleva el negocio, el usuario y el tipo de conexión.

**Migración** `20261016000000_per_user_calendars_tenant_oauth`:

- `integrations.ownerKey` y `integrations.userId`; la llave única pasa a ser (negocio, proveedor, dueño).
- La tabla `integration_apps`.
- `appointments.calendarIntegrationId` y `appointments.assignedUserId`.
- Es aditiva y ya está aplicada en local.

### 1.3 Importar y sincronizar datos (los dos agentes)

**Destinos:**

- **Productos.** La llave es el SKU.
- **Inventario.** La llave es el código del bien en la fuente, guardado en el nuevo campo `Listing.externalId`.
- **Clientes.** La llave es el celular. Puede traer el cumpleaños.

**Orígenes:**

- **Excel `.xlsx` o CSV:** se importa una vez. El CSV acepta `,`, `;` o tabulador, y codificación UTF-8 o Windows-1252.
- **Google Sheets:** se sincroniza solo.
- **PostgreSQL / MySQL:** se sincroniza solo y lee una tabla o vista.

**Comportamiento:**

- **Mapeo:**
  - Propone qué columna va en cada campo según el encabezado, incluidos sinónimos en español, y el usuario lo ajusta.
  - En inventario, las columnas sin asignar se pueden guardar como características del bien (año, kilometraje…).
- **Limpieza de valores:** precios en formato colombiano (`$ 82.000.000`), tipos escritos a mano ("camioneta" → vehículo), venta o arriendo, estado, celulares sin indicativo (se agrega 57) y fechas en varios formatos, incluido el número de serie de Excel.
- **Creación y actualización:** crea lo nuevo y actualiza lo existente por la llave. **No borra nada.**
- **Reporte:** dice cuántos se crearon, actualizaron y omitieron, con las primeras 25 filas con error y su motivo.
- **Coincidencias:** los bienes nuevos que llegan disponibles se cruzan con los compradores.
- **Frecuencia de sincronización:** cada hora, cada 6 horas, diaria o manual. Se puede pausar.

**Seguridad de las bases externas:**

- La URL de conexión se guarda **cifrada** (`SECRETS_ENCRYPTION_KEY`).
- La sesión es de **solo lectura**, con tiempo máximo por consulta y un tope de 5.000 filas.
- No se aceptan consultas libres: solo el nombre de una tabla o vista, validado con una expresión regular y entre comillas.
- **En producción se bloquean hosts privados:** localhost, 10/8, 172.16/12, 192.168/16, 169.254 (metadatos de la nube), CGNAT, IPv6 ULA y link-local, y `*.internal`. Se conecta a la IP ya validada para evitar el *DNS rebinding*. Se puede desactivar con `ALLOW_PRIVATE_DATA_SOURCES=true`.

| Pieza | Archivo |
|---|---|
| Campos por destino y mapeo automático | `src/modules/data-import/domain/targets.ts` |
| Limpieza de valores | `src/modules/data-import/domain/normalize.ts`, con pruebas |
| Lectores de Excel/CSV y de bases | `src/modules/data-import/infrastructure/file-reader.ts`, `sql-reader.ts` |
| Bloqueo de hosts privados | `src/modules/data-import/infrastructure/host-guard.ts` |
| Paso de filas a productos, inventario o clientes | `src/modules/data-import/application/apply-rows.ts` |
| Sincronización | `src/modules/data-import/application/data-sources.service.ts` |
| API | `app/api/v1/data-sources/**` |
| Pantalla y asistente | `app/(dashboard)/configuracion/datos/page.tsx`, `components/features/data-import/import-wizard.tsx` |
| Botón "Importar" | Productos, Inventario y Clientes; lleva a `/configuracion/datos?destino=…` |

### 1.4 Fechas especiales, red de contactos y felicitaciones

**Ficha del cliente:**

- **Fechas especiales:** su cumpleaños, el de alguien de su círculo ("María (esposa)"), aniversarios u otras fechas con su motivo. Cada fecha puede tener un mensaje propio.
- **Red de contactos:** relaciones entre clientes (lo refirió, esposa, socio…). Se ve desde los dos lados y no se duplica.
- **"No enviarle felicitaciones":** para el cliente que lo pidió.

**La IA guarda fechas sola.** La herramienta `save_special_date` está en los dos agentes y en todos sus especialistas. Si el cliente vuelve a dar la misma fecha, se corrige en vez de duplicarse.

**Página Felicitaciones** (menú Operación, para los dos tipos de negocio):

- Bandeja con las pestañas Por enviar, Enviadas, Con error y Descartadas. Cada mensaje se puede editar, enviar o descartar.
- Lista de las fechas de los próximos 30 días.
- Configuración:
  - Modo **Pedirme permiso**, por defecto, o **Automático**.
  - Plantillas por tipo, con `{nombre}`, `{persona}`, `{motivo}`, `{negocio}`, `{asesor}` y `{años}`.

**Cómo funciona:**

- **Preparación:** se preparan las felicitaciones de hoy y de mañana, y se avisa al dueño por WhatsApp si tiene número de avisos.
- **Modo automático:** el día de la fecha salen solas, entre 9 a. m. y 7 p. m.
- **Sin duplicados:** una restricción única por fecha y día evita mensajes repetidos.
- **Reserva antes de enviar:** cada mensaje queda reservado en la base, así dos clics o dos procesos no lo envían dos veces.
- **Vencimiento:** lo que no se aprueba en 3 días se descarta solo.
- **29 de febrero:** en años no bisiestos se felicita el 28.

**Tareas programadas** (`src/modules/jobs/infrastructure/scheduler.ts`, arranca en `instrumentation.ts`):

- Corren cada 10 minutos: felicitaciones y sincronización de fuentes.
- Se apagan con `SCHEDULER_DISABLED=true`.

| Pieza | Archivo |
|---|---|
| Fechas y plantillas | `src/modules/clients/domain/special-dates.ts`, con pruebas |
| Detalles del cliente | `src/modules/clients/application/details.use-cases.ts`, `components/features/clients/client-special-details.tsx` |
| Felicitaciones | `src/modules/greetings/**`, `app/(dashboard)/felicitaciones/page.tsx` |
| Envío de mensajes que inicia el negocio, guardados en la conversación | `src/modules/conversations/application/send-proactive.ts` |

### 1.5 Base de datos

**Migración** `prisma/migrations/20261015000000_integrations_imports_client_dates`, **solo aditiva:**

- Tablas nuevas: `integrations`, `data_sources`, `client_dates`, `client_relations` y `greetings`.
- Columnas nuevas:
  - `tenants.greetingMode` y `tenants.greetingTemplates`.
  - `clients.greetingsOptOut`.
  - `listings.externalId`, con índice único por negocio.
  - `appointments.durationMin`, `calendarProvider`, `calendarEventId` y `calendarEventUrl`.

Ya está aplicada en la base local con `migrate deploy`. Se verificó que las migraciones desde cero producen exactamente `schema.prisma`.

**Dependencias nuevas:** `exceljs@4.4.0`, `pg@8.13.1`, `mysql2@3.11.5` y `@types/pg` (desarrollo).

**Variables nuevas** (en `.env.example`):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ALLOW_PRIVATE_DATA_SOURCES`
- `SCHEDULER_DISABLED`

---

## 2. Cómo se probó

| Prueba | Resultado |
|---|---|
| `npm test`: agenda, OAuth state, fechas especiales, verificador y matching | 35/35 ✔ |
| `npx tsx scripts/probar-integraciones.ts`: de punta a punta con calendarios falsos (negocio y dos asesores), WhatsApp falso, Excel, CSV y una base PostgreSQL temporal | 37/37 ✔ |
| Registro de calendarios contra la base: asesores, vacaciones, miembro inactivo, credenciales propias vs. plataforma, invalidación al cambiar credenciales, permisos | 11/11 ✔ |
| Rutas HTTP de integraciones por usuario: credenciales propias, redirección a Google por tipo de conexión, cookie anti-CSRF, state falso | 13/13 ✔ |
| Rutas HTTP contra `next start` con el usuario demo: integraciones, importación, fechas, red, felicitaciones y páginas | todas ✔ |
| Registro de negocios de los dos tipos, y de un tipo inválido | ✔ (los negocios de prueba se borraron) |
| `tsc --noEmit` y `next build` | ✔ sin advertencias nuevas |

El script de punta a punta usa el negocio `intermediacion-demo` y deja la base como estaba.

**No se probó:**

- **La conexión real con Google** (ni la del negocio ni la de un asesor). No hay credenciales todavía; el flujo OAuth y las llamadas a Calendar y Sheets no se han ejecutado contra Google.
- **Conversaciones reales con la IA usando las herramientas nuevas.** Las herramientas se probaron directamente, pero no se ha verificado que el modelo (Gemini) calcule bien la fecha `YYYY-MM-DD` desde "el jueves" ni que siga el flujo de agendar.
- **Las pantallas en el navegador.** Se confirmó que cargan (HTTP 200), pero nadie las ha mirado ni usado con clics.
- **MySQL real.** Solo se probó PostgreSQL.

---

## 3. Lo que falta

### Para poder usarlo

1. **Crear las credenciales de Google** siguiendo `docs/INTEGRACION-GOOGLE.md`, ponerlas en `.env` y en Railway, y probar la conexión real.
2. **Probar con la IA real** agendar, mover y cancelar una visita, y guardar un cumpleaños. Se puede extender `scripts/probar-intermediacion.ts` con esos guiones.
3. **Revisar las pantallas en el navegador:** registro, inicio de intermediación, Integraciones, Fuentes de datos (asistente), Felicitaciones y la ficha del cliente.
4. **Hacer commit y push**, que no se ha hecho.
5. **Decidir qué hacer con los datos de prueba viejos del demo:** Carlos Pérez, Sandra Gómez y Cliente 0003 (teléfonos 57300999000x), con sus leads y su cita, y la Kia Sportage INV-0014 por aprobar. Quedaron de pruebas anteriores.

### Pendiente del Plan Completo (de antes)

- Seguimiento automático a compradores que dejan de responder.
- Resumen diario al dueño.
- Recordatorio de la visita al cliente y al asesor. Ahora es fácil: hay hora exacta y el programador de tareas ya existe.
- Fotos que envía el vendedor por WhatsApp, adjuntas al bien.
- **Fase 1, API oficial de Meta:** plantillas aprobadas para mensajes fuera de la ventana de 24 horas (ver Limitaciones).
- Error menor conocido: cuando piden fotos del Toyota, la IA muestra el bien pero no siempre envía el enlace de la foto.

---

## 4. Limitaciones conocidas y cómo arreglarlas

Ordenadas por prioridad.

### Alta

1. **Felicitaciones y coincidencias automáticas con Meta fallan fuera de las 24 horas.** Meta solo acepta plantillas aprobadas para escribirle a alguien que no ha escrito en las últimas 24 horas, y un cumpleaños casi siempre cae fuera de esa ventana. Hoy el envío falla y queda en "Con error".
   - *Arreglo:* agregar `sendTemplate` al puerto `WhatsAppProvider`, crear plantillas en Meta (por ejemplo `felicitacion_cumpleanos` con variable `{{1}}`) y usarlas cuando la última entrada del cliente tenga más de 24 horas.
2. **Una importación grande de inventario puede llenar de avisos al dueño.** Cada bien nuevo disponible corre las coincidencias, y `findMatchesForListing` le escribe al dueño por cada bien con compradores.
   - *Arreglo:* en `DataSourcesService.importRows`, pasar una opción a `MatchingService` para no avisar por bien y enviar un solo resumen al final ("Se importaron 40 bienes; 12 tienen compradores").
3. **La app de Google está "en pruebas".** Solo pueden conectarse 100 usuarios de prueba y Google pide reconectar cada 7 días.
   - *Arreglo:* publicar la app y pasar la verificación de Google (ver la guía).
   - Un negocio con Google Workspace puede usar sus propias credenciales como app **Interna** y evitar la verificación.
4. **No se ha probado la IA real con la agenda.** El riesgo es que el modelo calcule mal la fecha o no pase `dateTime`. *Arreglo:* probar con guiones; si falla, que `check_availability` acepte también "jueves", "mañana" o "pasado mañana" y lo convierta en el servidor.

### Media

5. **Las tareas programadas corren dentro del servidor web.** Sirve con una sola instancia en Railway. Con varias instancias no se duplican mensajes (hay reservas en la base), pero todas consultarían la base cada 10 minutos.
   - *Arreglo:* un cron externo (Railway Cron) que llame a un endpoint protegido, o un bloqueo con `pg_advisory_lock`.
6. **Un mensaje puede quedar enviado a medias.** La felicitación se marca SENT antes de enviarla, como reserva. Si el proceso muere justo en el envío, queda SENT sin `sentAt` y sin haber salido.
   - *Arreglo:* un estado intermedio `SENDING`, y que la tarea programada reintente lo que lleve más de 5 minutos en ese estado.
7. **La sincronización no archiva lo que se borró en la fuente.** Si un carro desaparece de la hoja, sigue disponible en el panel y la IA lo sigue ofreciendo.
   - *Arreglo:* una opción por fuente: "archivar lo que ya no esté en la fuente", solo para registros que vinieron de esa fuente (habría que guardar `sourceId` en el bien).
8. ~~**Un solo calendario por negocio.**~~ **Resuelto el 16 de octubre:** cada asesor conecta su calendario y las citas se reparten (ver 1.2.1).
   - **Pendiente de lo mismo:** reasignar a mano una cita a otro asesor desde Citas, y que un asesor vea solo sus citas. Hoy todos ven todas.
   - El reparto es por "menos citas próximas", sin tener en cuenta zona, tipo de bien ni especialidad del asesor.
9. **El cliente no recibe recordatorio ni invitación.** La cita queda solo en el calendario del negocio. *Arreglo:* recordatorio por WhatsApp un día antes y una hora antes, usando el programador.
10. **La zona horaria está fija en Bogotá** para las felicitaciones, el horario de envío automático y la fecha del prompt. La agenda sí permite otra zona.
    - *Arreglo:* guardar `timeZone` en el negocio y usarlo en `greetings.service.ts`, `matching.service.ts` y `system-prompt.ts`.
11. **El agente de tienda no usa el calendario.** Sirve para negocios de servicios (citas de belleza, consultas…). *Arreglo:* agregar `check_availability` y `request_visit` genéricas al perfil RETAIL. El puerto ya existe.

### Baja

12. **No se leen archivos `.xls` viejos**, solo `.xlsx` y CSV. El panel le pide al usuario guardarlo como `.xlsx`.
13. **La importación va fila por fila**, con 2 o 3 consultas por fila. Con 5.000 filas tarda decenas de segundos y la petición HTTP del archivo puede vencerse.
    - *Arreglo:* procesar en lotes con `createMany` y `upsert` en transacciones de 200, o pasar la importación de archivos a una tarea en segundo plano.
14. **Las bases externas solo leen una tabla completa**, hasta 5.000 filas, sin sincronización incremental. *Arreglo:* columna "actualizado en" opcional para leer solo lo que cambió.
15. **SSL de las bases externas.** Si la URL no trae `?sslmode=require`, la conexión va sin SSL, y algunos proveedores (Supabase, Neon) lo exigen. *Arreglo:* probar primero con SSL y, si el servidor no lo soporta, sin él.
16. **"Próximos 30 días" se calcula en memoria**, con un tope de 5.000 fechas por negocio. *Arreglo:* consultar por mes y día con SQL.
17. **No hay permisos nuevos:**
    - Integraciones y fuentes de datos usan `tenant.settings`.
    - Fechas y red de contactos usan `clients.*`.
    - Enviar felicitaciones usa `chats.send`.
    - *Arreglo:* si se necesita más control, agregar `integrations.manage` y `greetings.send` al seed de roles.
18. **ESLint no está configurado**, y `next lint` pide configurarlo. Solo se validó con `tsc` y `next build`.
19. **Textos en voseo.** Algunas pantallas viejas tienen voseo ("Registrá tu negocio", "Cargá tu catálogo"); las nuevas usan tú. *Arreglo:* unificar a español de Colombia.

---

## 5. Cómo retomarlo

```bash
cd F:\projectsme\whatsAppia
npm run dev                                   # servidor de desarrollo
npm test                                      # 35 pruebas unitarias
npx tsx scripts/probar-integraciones.ts       # punta a punta (usa intermediacion-demo)
npx prisma migrate deploy                     # en otra base (Railway lo hace al arrancar)
```

> La base local `crm` se comparte con otro proyecto: **no usar `prisma migrate dev`**, porque pide resetearla. Las migraciones se generan con `prisma migrate diff` y se aplican con `migrate deploy`.
>
> En Windows, para `prisma generate` hay que detener el servidor de desarrollo, que bloquea el DLL de Prisma.
