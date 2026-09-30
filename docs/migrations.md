# Migraciones de Prisma y estado de la base de datos

## ⚠️ Drift de la base de datos de desarrollo

`prisma migrate dev` **no se puede usar** en el entorno actual: detecta *drift* y pide **resetear la base de datos** (lo que borraría todos los datos).

La causa: la `DATABASE_URL` de desarrollo apuntaba a una base con tablas de **otro proyecto** (un inventario en español: `categorias`, `productos`, `movimientos_stock`, `usuarios`).

👉 **Antes de migrar, verificá que `DATABASE_URL` apunte a la base correcta de whatsAppia.**

## Migraciones escritas a mano (pendientes de aplicar)

Por el drift, las migraciones nuevas se escribieron a mano en `prisma/migrations/<timestamp>_<nombre>/migration.sql` y quedan **pendientes de aplicar**:

| Migración | Contenido |
|-----------|-----------|
| `20260612000000_twilio_support` | Campos de Twilio en `whatsapp_accounts`; campos de Meta pasan a opcionales. |
| `20260612010000_ai_usage_log` | Tabla `ai_usage_logs` (tracking de tokens/costo de IA). |

## Cómo aplicarlas

Con la `DATABASE_URL` correcta:

```bash
npx prisma generate      # funciona offline; ya ejecutado
npx prisma migrate deploy  # aplica las migraciones pendientes sin resetear
```

> `migrate deploy` aplica los archivos de migración existentes sin intentar "arreglar" drift — es el comando seguro para este caso.

## Tolerancia a tabla faltante

El código que escribe en `ai_usage_logs` (`logUsage()` en `respond-to-message.use-case.ts`) está **envuelto en try/catch**: si la tabla aún no existe, la IA sigue respondiendo con normalidad y solo se omite el registro de uso hasta aplicar la migración.
