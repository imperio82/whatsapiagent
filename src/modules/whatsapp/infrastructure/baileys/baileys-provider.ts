import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";
import pino from "pino";
import {
  default as makeWASocket,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type AnyMessageContent,
  type WASocket,
  type ConnectionState as BaileysState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { InfrastructureError } from "@shared/domain/errors";
import type {
  ConnectionState,
  InboundHandler,
  InboundMessage,
  SendTextParams,
  SendTextResult,
  SendVoiceParams,
  WhatsAppProvider,
} from "../../domain/ports/whatsapp-provider";

const BASE_DIR = process.env.BAILEYS_AUTH_DIR ?? ".whatsapp-sessions";
const LOG_LEVEL = process.env.BAILEYS_LOG_LEVEL ?? "warn";
const logger = pino({ level: LOG_LEVEL });

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;
const ACK_TIMEOUT_MS = 10_000;

interface Session {
  socket?: WASocket;
  state: ConnectionState;
  starting: boolean;
  retries: number;
  /**
   * Mensajes salientes esperando ack del server. Si pasan ACK_TIMEOUT_MS
   * sin que llegue, asumimos que la entrega falló y lo loguamos.
   */
  pendingAcks: Map<string, { jid: string; timer: NodeJS.Timeout }>;
}

/**
 * Provider de WhatsApp basado en Baileys. Mantiene una sesión por tenant
 * en memoria + auth state persistido a disco. NO escala a varios procesos;
 * es para desarrollo. Producción usa MetaCloudProvider.
 */
export class BaileysProvider implements WhatsAppProvider {
  readonly kind = "baileys" as const;

  private readonly sessions = new Map<string, Session>();
  private readonly inboundHandlers: InboundHandler[] = [];

  /**
   * Versión cacheada de WhatsApp Web que el servidor acepta.
   * Se consulta una sola vez por proceso para evitar 405 cuando
   * Baileys queda atrás del protocolo.
   */
  private waVersion: [number, number, number] | undefined;

  onInbound(handler: InboundHandler): void {
    this.inboundHandlers.push(handler);
  }

  /**
   * Recorre BAILEYS_AUTH_DIR y arranca un socket para cada tenant que
   * ya tenga credenciales persistidas. Idempotente — si ya hay sesión
   * activa para ese tenant, no hace nada.
   */
  async restoreAllSessions(): Promise<void> {
    const baseDir = join(process.cwd(), BASE_DIR);
    if (!existsSync(baseDir)) {
      console.log(`[baileys] no hay sesiones para restaurar (${baseDir} no existe)`);
      return;
    }
    let entries: string[];
    try {
      entries = readdirSync(baseDir);
    } catch (err) {
      console.warn(`[baileys] no se pudo leer ${baseDir}:`, err);
      return;
    }

    const tenantsToRestore: string[] = [];
    for (const entry of entries) {
      const dir = join(baseDir, entry);
      try {
        if (!statSync(dir).isDirectory()) continue;
        if (!existsSync(join(dir, "creds.json"))) continue;
        tenantsToRestore.push(entry);
      } catch {
        // ignorar entradas inválidas
      }
    }

    if (tenantsToRestore.length === 0) {
      console.log(`[baileys] sin sesiones previas para restaurar`);
      return;
    }

    console.log(
      `[baileys] restaurando ${tenantsToRestore.length} sesión(es): ${tenantsToRestore.join(", ")}`,
    );
    for (const tenantId of tenantsToRestore) {
      this.start(tenantId).catch((err) =>
        console.error(`[baileys:${tenantId}] error en restore:`, err),
      );
    }
  }

  getState(tenantId: string): ConnectionState {
    return this.sessions.get(tenantId)?.state ?? { kind: "disconnected" };
  }

  async start(tenantId: string): Promise<void> {
    let session = this.sessions.get(tenantId);
    if (session?.starting) {
      console.log(`[baileys:${tenantId}] start() ignorado: ya está iniciando`);
      return;
    }
    if (session?.state.kind === "connected") {
      console.log(`[baileys:${tenantId}] start() ignorado: ya conectado`);
      return;
    }
    if (session?.state.kind === "qr") {
      console.log(`[baileys:${tenantId}] start() ignorado: ya hay QR esperando`);
      return;
    }

    session = session ?? {
      state: { kind: "disconnected" },
      starting: false,
      retries: 0,
      pendingAcks: new Map(),
    };
    session.starting = true;
    session.state = { kind: "connecting" };
    this.sessions.set(tenantId, session);

    try {
      const dir = join(process.cwd(), BASE_DIR, tenantId);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        console.log(`[baileys:${tenantId}] auth dir creado: ${dir}`);
      }

      const { state, saveCreds } = await useMultiFileAuthState(dir);

      // Versión actualizada de WhatsApp Web (evita 405 Connection Failure)
      if (!this.waVersion) {
        try {
          const { version, isLatest } = await fetchLatestBaileysVersion();
          this.waVersion = version;
          console.log(
            `[baileys] versión WhatsApp Web: ${version.join(".")}${isLatest ? " (latest)" : ""}`,
          );
        } catch (err) {
          console.warn(`[baileys] no se pudo obtener versión latest, usando default:`, err);
        }
      }

      console.log(`[baileys:${tenantId}] creando socket…`);
      const sock = makeWASocket({
        auth: state,
        logger,
        browser: ["whatsAppia", "Chrome", "1.0.0"],
        syncFullHistory: false,
        markOnlineOnConnect: false,
        ...(this.waVersion ? { version: this.waVersion } : {}),
      });

      session.socket = sock;
      sock.ev.on("creds.update", saveCreds);
      sock.ev.on("connection.update", (u) => {
        const statusCode = (u.lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        console.log(`[baileys:${tenantId}] connection.update`, {
          connection: u.connection,
          hasQR: !!u.qr,
          statusCode,
        });
        void this.handleConnection(tenantId, u);
      });
      sock.ev.on("messages.upsert", (m) => this.handleMessages(tenantId, sock, m));
      // Acks del server: revela si un sendMessage realmente llegó.
      // status 1=PENDING, 2=SERVER_ACK, 3=DELIVERY_ACK, 4=READ, 5=PLAYED, 0=ERROR
      sock.ev.on("messages.update", (updates) => {
        const s2 = this.sessions.get(tenantId);
        for (const u of updates) {
          if (!u.key.fromMe) continue;
          const s = u.update.status;
          if (s === undefined || s === null) continue;
          const tag =
            s === 0
              ? "ERROR"
              : s === 1
                ? "PENDING (no llegó al server WhatsApp)"
                : s === 2
                  ? "SERVER_ACK (server recibió)"
                  : s === 3
                    ? "DELIVERED (cel destino recibió)"
                    : s === 4
                      ? "READ"
                      : s === 5
                        ? "PLAYED"
                        : `status=${s}`;
          console.log(
            `[baileys:${tenantId}] ack mensaje ${u.key.id} → ${tag} (jid=${u.key.remoteJid})`,
          );
          // Si el ack indica entrega real, cancelamos el timer de timeout.
          if (s2 && u.key.id && s >= 2) {
            const entry = s2.pendingAcks.get(u.key.id);
            if (entry) {
              clearTimeout(entry.timer);
              s2.pendingAcks.delete(u.key.id);
            }
          }
        }
      });

      console.log(`[baileys:${tenantId}] socket listo. Esperando QR…`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[baileys:${tenantId}] error iniciando:`, err);
      session.state = { kind: "error", reason: msg };
      session.socket = undefined;
    } finally {
      session.starting = false;
    }
  }

  async stop(tenantId: string): Promise<void> {
    const s = this.sessions.get(tenantId);
    if (!s) return;
    if (s.socket) {
      try {
        s.socket.end(undefined);
      } catch {
        // ignore
      }
    }
    s.socket = undefined;
    s.state = { kind: "disconnected" };
    s.retries = 0;
  }

  async sendText(tenantId: string, params: SendTextParams): Promise<SendTextResult> {
    return this.deliver(tenantId, params.to, { text: params.text }, `"${params.text.slice(0, 60)}..."`);
  }

  /** Nota de voz (push-to-talk): WhatsApp la muestra como audio grabado, con su onda. */
  async sendVoice(tenantId: string, params: SendVoiceParams): Promise<SendTextResult> {
    return this.deliver(
      tenantId,
      params.to,
      { audio: params.audio, mimetype: "audio/ogg; codecs=opus", ptt: true, seconds: Math.round(params.seconds) },
      `nota de voz de ${Math.round(params.seconds)} s`,
    );
  }

  private async deliver(
    tenantId: string,
    to: string,
    content: AnyMessageContent,
    label: string,
  ): Promise<SendTextResult> {
    let session = this.sessions.get(tenantId);

    // Si no hay sesión en memoria pero existen credenciales en disco,
    // rehidratamos automáticamente. Esto cubre el caso de hot reload o
    // restart del proceso donde el Map en memoria se pierde pero el auth
    // state está persistido.
    if (!session?.socket?.user) {
      const dir = join(process.cwd(), BASE_DIR, tenantId);
      const credsPath = join(dir, "creds.json");
      if (existsSync(credsPath)) {
        console.log(
          `[baileys:${tenantId}] sendText sin sesión activa pero hay creds en disco. Rehidratando…`,
        );
        await this.start(tenantId);
        // esperar hasta 8s a que el socket autentique
        const waitUntil = Date.now() + 8000;
        while (Date.now() < waitUntil) {
          await new Promise((r) => setTimeout(r, 250));
          session = this.sessions.get(tenantId);
          if (session?.socket?.user) break;
        }
      }
    }

    if (!session?.socket?.user) {
      const kind = session?.state.kind ?? "sin-sesion";
      const reason =
        session?.state.kind === "error" ? session.state.reason : undefined;
      const activeTenants = Array.from(this.sessions.entries())
        .map(([t, s]) => `${t}=${s.state.kind}`)
        .join(", ");
      console.error(
        `[baileys:${tenantId}] sendText falló. Estado actual del provider: { tenants: [${activeTenants}] }`,
      );
      const detail =
        kind === "error"
          ? ` Detalle: ${reason ?? "desconocido"}`
          : kind === "qr"
            ? " Escanea el QR primero en /configuracion/whatsapp."
            : kind === "connecting"
              ? " La conexión está iniciando, espera unos segundos."
              : " Ve a /configuracion/whatsapp para vincular.";
      throw new InfrastructureError(
        `WhatsApp no está conectado (estado: ${kind}).${detail}`,
      );
    }

    // Sync defensivo: si el socket está vivo pero el flag dice otra cosa,
    // corregimos para que el resto del sistema (UI, status) vea la realidad.
    if (session.state.kind !== "connected") {
      const phoneNumber = session.socket.user.id?.split(":")[0]?.split("@")[0] ?? "";
      console.log(
        `[baileys:${tenantId}] sync: socket vivo pero state era "${session.state.kind}", marcando como connected.`,
      );
      session.state = { kind: "connected", phoneNumber, connectedAt: new Date() };
      session.retries = 0;
    }

    const originalJid = toJid(to);
    // Si el destino es un LID, intentamos resolverlo al PN real usando el
    // mapping interno de Baileys. Enviar al PN @s.whatsapp.net es mucho más
    // confiable que enviar a un @lid (donde el server puede no entregar por
    // falta de sesión Signal previa).
    let jid = originalJid;
    if (originalJid.endsWith("@lid")) {
      try {
        const lidMapping = session.socket.signalRepository?.lidMapping;
        const resolvedPn = await lidMapping?.getPNForLID(originalJid);
        if (resolvedPn) {
          // El resultado puede venir como `<phone>:<device>@s.whatsapp.net`.
          // Para sendMessage queremos quitar el device suffix.
          jid = stripDeviceSuffix(resolvedPn);
          console.log(
            `[baileys:${tenantId}] LID resuelto: ${originalJid} → ${jid}`,
          );
        } else {
          console.warn(
            `[baileys:${tenantId}] LID ${originalJid} sin mapeo PN conocido. ` +
              `Voy a intentar enviar al @lid igual, pero puede no entregar.`,
          );
        }
      } catch (err) {
        console.warn(
          `[baileys:${tenantId}] error resolviendo LID ${originalJid}:`,
          err,
        );
      }
    }
    const isLid = jid.endsWith("@lid");
    console.log(
      `[baileys:${tenantId}] enviando a ${jid}${isLid ? " (LID sin resolver — puede no entregar)" : ""}: ${label}`,
    );
    let result;
    try {
      result = await session.socket.sendMessage(jid, content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[baileys:${tenantId}] socket.sendMessage falló:`, err);
      throw new InfrastructureError(`Falló sendMessage: ${msg}`);
    }
    if (!result?.key?.id) {
      console.error(`[baileys:${tenantId}] sendMessage devolvió respuesta sin id:`, result);
      throw new InfrastructureError("WhatsApp no devolvió ID de mensaje (probable que no se entregó)");
    }
    console.log(
      `[baileys:${tenantId}] sendMessage devolvió id=${result.key.id} status=${result.status ?? "?"} remoteJid=${result.key.remoteJid}. ` +
        `Esperá el ack en messages.update para confirmar entrega real.`,
    );
    // Programamos un timeout: si en ACK_TIMEOUT_MS no llegó SERVER_ACK,
    // loguamos como entrega presunta fallida. Esto evita ambigüedad cuando
    // WhatsApp se queda con el mensaje en PENDING sin emitir nada.
    const msgId = result.key.id;
    const targetJid = result.key.remoteJid ?? jid;
    const timer = setTimeout(() => {
      const s = this.sessions.get(tenantId);
      if (s?.pendingAcks.has(msgId)) {
        console.warn(
          `[baileys:${tenantId}] TIMEOUT: el mensaje ${msgId} a ${targetJid} no recibió ack del server en ${ACK_TIMEOUT_MS}ms. ` +
            `Probablemente no se entregó (USync fail, LID sin sesión, o destino no rutable).`,
        );
        s.pendingAcks.delete(msgId);
      }
    }, ACK_TIMEOUT_MS);
    session.pendingAcks.set(msgId, { jid: targetJid, timer });
    return { providerMessageId: msgId, sentAt: new Date() };
  }

  private async handleConnection(
    tenantId: string,
    update: Partial<BaileysState>,
  ): Promise<void> {
    const session = this.sessions.get(tenantId);
    if (!session) return;

    if (update.qr) {
      const qrPng = await QRCode.toDataURL(update.qr, { margin: 1, scale: 6 });
      session.state = {
        kind: "qr",
        qrPng,
        qrRaw: update.qr,
        expiresAt: new Date(Date.now() + 60_000),
      };
      session.retries = 0;
    }

    if (update.connection === "open") {
      const self = session.socket?.user;
      const phoneNumber = self?.id ? self.id.split(":")[0]!.split("@")[0]! : "";
      session.state = { kind: "connected", phoneNumber, connectedAt: new Date() };
      session.retries = 0;
    }

    if (update.connection === "close") {
      const reason = (update.lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const loggedOut = reason === DisconnectReason.loggedOut;
      const restartRequired = reason === DisconnectReason.restartRequired;

      session.socket = undefined;

      if (loggedOut) {
        session.state = { kind: "error", reason: "Sesión cerrada desde el celular" };
        session.retries = 0;
        return;
      }

      if (session.retries >= MAX_RETRIES) {
        const why =
          reason === 405
            ? "Connection Failure 405 — la versión de Baileys está rechazada por WhatsApp. Probá `npm i @whiskeysockets/baileys@latest`."
            : `Reintentos agotados (status ${reason ?? "?"})`;
        console.error(`[baileys:${tenantId}] ${why}`);
        session.state = { kind: "error", reason: why };
        return;
      }

      session.retries++;
      session.state = { kind: "disconnected" };
      console.log(
        `[baileys:${tenantId}] reintento ${session.retries}/${MAX_RETRIES} en ${RETRY_DELAY_MS}ms (status ${reason ?? "?"}${restartRequired ? ", restart required" : ""})`,
      );
      setTimeout(() => {
        this.start(tenantId).catch((err) =>
          console.error(`[baileys:${tenantId}] retry start falló:`, err),
        );
      }, RETRY_DELAY_MS);
    }
  }

  private async handleMessages(
    tenantId: string,
    sock: WASocket,
    upsert: { messages: import("@whiskeysockets/baileys").proto.IWebMessageInfo[]; type: string },
  ): Promise<void> {
    if (upsert.type !== "notify") return;

    const self = sock.user?.id?.split(":")[0]!.split("@")[0] ?? "";

    // Si llegan mensajes, el socket está vivo. Sincronizamos el flag por si
    // se quedó desactualizado durante reintentos.
    const session = this.sessions.get(tenantId);
    if (session && session.state.kind !== "connected" && sock.user) {
      console.log(
        `[baileys:${tenantId}] sync: mensaje recibido pero state era "${session.state.kind}", marcando como connected.`,
      );
      session.socket = sock;
      session.state = { kind: "connected", phoneNumber: self, connectedAt: new Date() };
      session.retries = 0;
    }

    for (const msg of upsert.messages) {
      if (!msg.key) continue;
      if (msg.key.fromMe) continue;
      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || remoteJid.endsWith("@g.us")) continue; // Ignorar grupos

      const text =
        msg.message?.conversation ??
        msg.message?.extendedTextMessage?.text ??
        msg.message?.imageMessage?.caption ??
        "";

      // Preservamos el JID completo (puede ser ...@s.whatsapp.net o ...@lid).
      // Sin esto, perdemos info necesaria para responder al cliente correcto.
      const fullJid = stripDeviceSuffix(remoteJid);

      // Notas de voz: se descargan aquí porque Baileys no deja bajarlas después
      const audioMessage = msg.message?.audioMessage;
      let media: InboundMessage["media"];
      if (audioMessage) {
        try {
          const data = await downloadMediaMessage(msg as Parameters<typeof downloadMediaMessage>[0], "buffer", {});
          media = { data, mimeType: audioMessage.mimetype ?? "audio/ogg" };
        } catch (err) {
          console.warn(`[baileys:${tenantId}] no se pudo descargar la nota de voz:`, err);
        }
      }

      const inbound: InboundMessage = {
        tenantId,
        from: fullJid,
        toPhoneNumber: self,
        providerMessageId: msg.key.id ?? `${Date.now()}`,
        type: audioMessage ? "audio" : "text",
        text,
        media,
        contactName: msg.pushName ?? undefined,
        timestamp: new Date((Number(msg.messageTimestamp) || Date.now() / 1000) * 1000),
      };

      for (const h of this.inboundHandlers) {
        try {
          await h(inbound);
        } catch (err) {
          console.error("[BaileysProvider] inbound handler error:", err);
        }
      }
    }
  }
}

/**
 * Construye el JID destino para sendMessage. Si ya viene con sufijo
 * (s.whatsapp.net o lid), se respeta — esto es crítico para responder a
 * clientes con LID, donde el "número" no es realmente un teléfono.
 * Si viene con prefijo `lid:` (formato usado en Client.phone para LIDs),
 * lo reconvertimos a `<id>@lid` para no enviar a un JID inválido.
 * Solo dígitos: asumimos s.whatsapp.net (formato clásico).
 */
function toJid(phoneOrJid: string): string {
  if (phoneOrJid.includes("@")) return phoneOrJid;
  if (phoneOrJid.startsWith("lid:")) {
    const id = phoneOrJid.slice(4).replace(/\D/g, "");
    return `${id}@lid`;
  }
  const clean = phoneOrJid.replace(/\D/g, "");
  return `${clean}@s.whatsapp.net`;
}

/**
 * Quita el sufijo de dispositivo de un JID (`:NN`) pero conserva el
 * sufijo de tipo (`@s.whatsapp.net` / `@lid`).
 */
function stripDeviceSuffix(jid: string): string {
  const atIdx = jid.indexOf("@");
  if (atIdx === -1) return jid;
  const left = jid.slice(0, atIdx).split(":")[0]!;
  const right = jid.slice(atIdx);
  return `${left}${right}`;
}
