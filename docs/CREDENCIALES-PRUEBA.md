# Credenciales de prueba

Solo para el entorno local (`http://localhost:3000`) con los datos de ejemplo. **Nunca uses estas credenciales en
producción**, y no escribas en este archivo claves reales (API de Gemini, Meta, ElevenLabs, Google): esas van solo en `.env`,
que no se sube a GitHub.

## Usuario demo

| Campo | Valor |
|---|---|
| Correo | `demo@whatsappia.app` |
| Contraseña | `demo1234` |

Lo crea `npm run db:seed`. Tiene acceso a dos negocios; se cambia entre ellos con el selector de arriba a la izquierda:

| Negocio | Tipo | Se crea con |
|---|---|---|
| Negocio Demo | Tienda (catálogo y pedidos) | `npm run db:seed` |
| Eje Autos & Hogar | Intermediación (vehículos e inmuebles) | `npm run db:seed:intermediacion` |

El usuario demo **no** es administrador de la plataforma: en `/plataforma` le sale 404, como a cualquier cliente.

## Plataforma (`/plataforma`)

No tiene contraseña propia: entra el dueño con su cuenta normal si cumple las dos condiciones.

1. Su cuenta está marcada como administrador: `npm run admin:grant -- tu@correo.com`
2. Su correo está en `.env`: `PLATFORM_ADMIN_EMAILS="tu@correo.com"`

Después de cambiar cualquiera de las dos, cierra sesión y vuelve a entrar.

## Simulador del agente

No necesita credenciales. Cada chat nuevo usa un teléfono de prueba al azar (`573` + 9 dígitos) que termina en `@sim`:
nada de lo que responde el agente sale por WhatsApp.

- No uses el número de un asesor del equipo: activaría el asistente del asesor en vez de la atención al cliente.
- Para probar la voz, activa «Responder con voz» en Administración → Voz del agente y graba una nota de voz con el micrófono.

## Registro de un negocio nuevo

En `/register` se puede crear un negocio de prueba con cualquier correo; queda en el plan Emprende con 14 días de prueba.
