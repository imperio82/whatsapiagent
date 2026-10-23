import { getWhatsAppProvider } from "@modules/whatsapp/infrastructure/provider-factory";
import { GreetingsService } from "@modules/greetings/application/greetings.service";
import { DataSourcesService } from "@modules/data-import/application/data-sources.service";
import { MatchingService } from "@modules/matching/application/matching.service";

/**
 * Tareas periódicas dentro del mismo servidor (Railway corre una sola instancia):
 * - Felicitaciones: preparar las de hoy y mañana, enviar las automáticas y vencer las viejas.
 * - Fuentes de datos: sincronizar las hojas y bases externas a las que ya les toca.
 *
 * Cada tarea es idempotente (restricciones únicas y "reservas" en la base), así que si algún día
 * corren dos instancias no se duplican mensajes. Se apaga con SCHEDULER_DISABLED=true.
 */

const EVERY_MS = 10 * 60 * 1000;
const FIRST_RUN_MS = 60 * 1000;

type Job = { name: string; run: () => Promise<unknown> };

const globalForScheduler = globalThis as unknown as { __waScheduler?: NodeJS.Timeout };

export function startScheduler(): void {
  if (process.env.SCHEDULER_DISABLED === "true") return;
  // En desarrollo Next recarga módulos: un solo programador por proceso
  if (globalForScheduler.__waScheduler) return;

  const whatsapp = getWhatsAppProvider();
  const jobs: Job[] = [
    { name: "felicitaciones", run: () => new GreetingsService(whatsapp).run() },
    { name: "fuentes de datos", run: () => new DataSourcesService(new MatchingService(whatsapp)).syncDue() },
  ];

  let running = false;
  const tick = async () => {
    if (running) return; // la anterior aún no termina
    running = true;
    try {
      for (const job of jobs) {
        try {
          await job.run();
        } catch (err) {
          console.error(`[scheduler] la tarea "${job.name}" falló:`, err);
        }
      }
    } finally {
      running = false;
    }
  };

  setTimeout(() => void tick(), FIRST_RUN_MS).unref?.();
  globalForScheduler.__waScheduler = setInterval(() => void tick(), EVERY_MS);
  globalForScheduler.__waScheduler.unref?.();
  console.log("[scheduler] tareas programadas activas (cada 10 minutos)");
}
