/**
 * Hook de Next.js que corre una vez al arrancar el server.
 * Lo usamos para registrar el handler de mensajes entrantes en el provider
 * de WhatsApp (Baileys / Meta) — así está listo antes que llegue cualquier
 * mensaje sin tener que tocar route handlers.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureWhatsAppWired } = await import(
      "@modules/whatsapp/infrastructure/provider-bootstrap"
    );
    ensureWhatsAppWired();
  }
}
