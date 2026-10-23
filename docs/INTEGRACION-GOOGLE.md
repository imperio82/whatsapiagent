# Conectar Google (Calendar y Sheets)

## Cómo funciona

Hay tres cosas distintas, y ninguna es compartida entre negocios:

| Qué | De quién | Para qué | Dónde se configura |
|---|---|---|---|
| **Credenciales de la app** (Client ID y Secret) | Del negocio, o de la plataforma si el negocio no tiene | Que Google sepa qué app pide permiso | Integraciones → *Credenciales de Google* (o `.env` como respaldo) |
| **Cuenta de Google del negocio** | Del negocio | Google Sheets y calendario compartido | Integraciones → *Cuenta de Google del negocio* |
| **Calendario de cada asesor** | De cada usuario | Las visitas que atiende esa persona | Integraciones → *Mi calendario* (cada uno el suyo) |

- Los tokens de cada conexión y el secreto de las credenciales se guardan **cifrados por negocio**. Nada de eso va en variables de entorno.
- El `.env` (`GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`) es **opcional**. Son las credenciales de la plataforma, para los negocios que no quieran crear su propio proyecto de Google Cloud.

### En qué calendario se agenda

1. **Asesores con su calendario conectado y "Recibir visitas" encendido:** las visitas se reparten entre ellos.
   - Se ofrece un horario si al menos un asesor está libre.
   - La cita se asigna al asesor libre con menos citas próximas.
   - Si la cita se mueve y su asesor sigue libre, se queda con él; si no, pasa al calendario de otro.
2. **Si nadie del equipo tiene calendario:** se usa el calendario de la cuenta del negocio.
3. **Si no hay ningún calendario:** el agente deja la visita como solicitud y un asesor confirma la hora (como antes).

Un asesor que queda inactivo en el negocio, o que apaga "Recibir visitas" (por vacaciones, por ejemplo), deja de recibir citas. Las citas que ya tenía se pueden seguir moviendo o cancelando en su calendario.

Con Google conectado:

- El agente de intermediación consulta los horarios libres, agenda visitas y pruebas de manejo, las mueve y las cancela.
- Lo que se confirma, mueve o cancela en **Citas** se refleja en el calendario donde está la cita. Cada cita muestra qué asesor la atiende.
- Se pueden sincronizar productos, inventario o clientes desde una hoja de Google, usando la cuenta del negocio (Configuración → Fuentes de datos).

## 1. Crear el proyecto en Google Cloud (~10 minutos)

Lo hace **cada negocio que quiera sus propias credenciales**, o una sola vez la plataforma para quienes no las tengan.

1. Entra a <https://console.cloud.google.com/> y crea un proyecto, por ejemplo `whatsappia-minegocio`.
2. **APIs y servicios → Biblioteca**: habilita **Google Calendar API** y **Google Sheets API**.
3. **Pantalla de consentimiento de OAuth** (en la consola nueva: *Google Auth Platform → Branding / Audience / Data access*):
   - Tipo de usuario: **Externo**, o **Interno** si el negocio usa Google Workspace y solo se conecta su equipo.
   - Nombre de la app, correo de soporte y correo de contacto.
   - Permisos:
     - `openid` y `.../auth/userinfo.email`
     - `https://www.googleapis.com/auth/calendar.events`
     - `https://www.googleapis.com/auth/calendar.readonly`
     - `https://www.googleapis.com/auth/spreadsheets.readonly`
   - **Usuarios de prueba**: los correos de Google de quienes van a conectar mientras la app esté "en pruebas" (máximo 100).
4. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**:
   - **URI de redireccionamiento autorizado:** el que muestra el panel en Integraciones → *Credenciales de Google*, botón copiar. Es este:
     - Desarrollo: `http://localhost:3000/api/v1/integrations/google/callback`
     - Producción: `https://TU-DOMINIO/api/v1/integrations/google/callback`
   - Copia el **Client ID** y el **Client Secret**.

## 2. Cargar las credenciales

- **Credenciales propias del negocio** (recomendado):
  1. En el panel, ve a **Integraciones → Credenciales de Google → Usar las mías**.
  2. Pega el Client ID y el Secret. Solo puede hacerlo quien tenga permiso de configuración del negocio.
  3. El secreto se guarda cifrado y no se vuelve a mostrar.
  4. Si después se cambian, las cuentas conectadas deben reconectarse: Google amarra los tokens a las credenciales.
- **Credenciales de la plataforma** (respaldo): ponlas en `.env` y en Railway, y reinicia el servidor.

  ```env
  GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
  GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
  ```

En los dos casos, `NEXT_PUBLIC_APP_URL` debe ser la URL pública de la app (con ella se arma el URI de redirección) y `SECRETS_ENCRYPTION_KEY` debe existir.

## 3. Conectar

1. **El administrador:** Integraciones → **Cuenta de Google del negocio → Conectar con Google**. Se usa para Sheets y como calendario compartido.
2. **Cada asesor:** inicia sesión con su usuario → Integraciones → **Mi calendario → Conectar con Google**. Después elige su calendario, sus días, su horario y la duración de cada visita.
3. **Mientras la app esté en pruebas**, Google muestra "Google no verificó esta app": entrar a **Configuración avanzada → Ir a la app**.

En **Calendarios del equipo** el administrador ve quién tiene el suyo conectado y quién recibe visitas.

## 4. Antes de salir a producción con muchos usuarios

- **Límites mientras la app está en pruebas:** solo los usuarios de prueba pueden conectarse, y Google pide reconectar cada 7 días.
- **Para quitarlos:** publicar la app y pasar la verificación de Google (los permisos de Calendar y Sheets son "sensibles"). Se necesita una política de privacidad publicada, el dominio verificado y un video corto del uso.
- **Atajo para un negocio con Google Workspace:** puede usar sus propias credenciales con tipo de usuario **Interno**. Así no necesita verificación para su propio equipo.

## Cómo está construido (para desarrolladores)

- **Puertos** (`src/modules/integrations/domain/ports/`): `CalendarProvider` y `SpreadsheetProvider`. El agente y los casos de uso solo conocen estos puertos.
- **Tabla `integrations`:** una fila por conexión.
  - `ownerKey = "business"` es la del negocio; `ownerKey = "user:<id>"` es la de un asesor.
  - Los tokens van cifrados.
  - Ajustes en `settings`: agenda y `acceptsVisits`.
- **Tabla `integration_apps`:** las credenciales propias de cada negocio, con el secreto cifrado.
- **Conexión con Google** (`src/modules/integrations/infrastructure/google/`):
  - OAuth por conexión, con renovación automática del token.
  - Las credenciales salen de `googleCredentials(tenantId)`: primero las del negocio y si no, las del entorno.
  - Calendar y Sheets por REST con `fetch`.
- **Registro** (`src/modules/integrations/infrastructure/registry.ts`):
  - `resolveCalendars(tenantId)` devuelve los calendarios de los asesores disponibles, o el del negocio si no hay ninguno.
  - `resolveCalendarById` encuentra el calendario de una cita existente.
  - `resolveSpreadsheets` usa la conexión del negocio.
- **Agenda** (`src/modules/integrations/application/scheduling.service.ts`): unión de horarios libres, asignación del asesor y paso de una cita de un calendario a otro.
- **Agregar otro proveedor** (Outlook, Calendly…): implementar el puerto y agregarlo a `catalog.ts`, al enum `IntegrationProvider` y al registro. El agente no cambia.
- **Seguridad del flujo OAuth:** `state` firmado con HMAC que incluye el negocio, el usuario y el tipo de conexión, más un nonce en cookie. Conectar la cuenta del negocio exige `tenant.settings`; el calendario propio, solo ser miembro activo.
