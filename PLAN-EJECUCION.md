# 🚀 PLAN DE EJECUCIÓN — whatsAppia → Servicios de IA

> **Objetivo:** Terminar el 25-30% que falta (Cloud API oficial + IA + demo vendible)
> y arrancar una rutina diaria constante de construir → aprender → vender.
>
> **REGLA DE ORO:** Cada semana se mide en **clientes contactados**, no en líneas de código.
> Programar es cómodo; vender es el cuello de botella real.

---

## 🗺️ ROADMAP (4 semanas para quedar VENDIBLE)

```
SEMANA 1          SEMANA 2          SEMANA 3          SEMANA 4
┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐
│  FASE 1   │    │  FASE 2   │    │  FASE 3   │    │  FASE 4   │
│ WhatsApp  │ →  │    IA     │ →  │  Tests +  │ →  │  Demo +   │
│ Cloud API │    │  + Evals  │    │ Hardening │    │  Contenido│
│  oficial  │    │           │    │           │    │           │
└───────────┘    └───────────┘    └───────────┘    └───────────┘
  CONSTRUIR ──────────────────────►  ◄──── DISTRIBUIR empieza aquí
```

**Peso del esfuerzo por semana:**
```
        Construir   Aprender   Vender/Contenido
Sem 1:  ███████░░   ██░░░░░░   █░░░░░░░
Sem 2:  ██████░░░   ███░░░░░   ██░░░░░░
Sem 3:  █████░░░░   ███░░░░░   ████░░░░
Sem 4:  ███░░░░░░   ██░░░░░░   ███████░   ◄── el switch a vender
```

---

## ✅ FASE 1 — Terminar WhatsApp (Cloud API oficial)
> Hoy corres en Baileys (no-oficial, riesgo de baneo). Sin esto NO le cobras a nadie.

- [ ] **1.1** Implementar `getState()` real en `meta-cloud-provider.ts`
      (hoy devuelve `{kind:"disconnected"}` hardcodeado → leer de `WhatsappAccount` en DB)
- [ ] **1.2** Cifrar tokens en reposo: `accessTokenEnc` hoy es texto plano
      (AES-256 con clave en `.env`; quitar el `// TODO cifrado en reposo`)
- [ ] **1.3** Completar el handshake de verificación del webhook (campo `verified`)
- [ ] **1.4** Mover `ensureWhatsAppWired()` fuera del POST del webhook (a init/arranque)
- [ ] **1.5** Probar el loop COMPLETO en Cloud API real:
      `mensaje entra → webhook → ingest → IA responde → sendText sale`
- [ ] **1.6** Documentar el onboarding: cómo conectar un número (Phone Number ID + WABA + token permanente)

**✔️ Done cuando:** un número de WhatsApp Business real recibe y responde por Cloud API, sin Baileys.

---

## ✅ FASE 2 — Terminar la IA + Evals
> El agente ya funciona (function calling + 3 tools). Falta robustez y medir calidad.

- [x] **2.1** Manejar `create_pending_order` cuando NO hay `clientId`
      (crear/asociar cliente automáticamente desde el número de WhatsApp) — `ensureClientId()` en `tools.ts`
- [x] **2.2** Guardrails: que la IA NO invente productos ni precios (reforzar system prompt + validar
      stock real en `create_pending_order` + temperatura 0.2)
- [x] **2.3** Tracking de costo de tokens por conversación — modelo `AiUsageLog` + `pricing.ts` (costo estimado)
- [ ] **2.4** 🎯 **EVALS** (tu señal #1 de "sé construir con LLMs"): _(pendiente — se hace al final con los tests)_
      - [ ] Dataset de 15-20 conversaciones de prueba (pedido feliz, cliente confundido, fuera de catálogo…)
      - [ ] LLM-as-judge: ¿respondió bien? ¿creó la orden correcta? ¿no inventó?
      - [ ] Script que corre los evals y da un % de acierto
- [x] **2.5** Manejo de errores: si la IA falla, mensaje de respaldo + alerta (no silencio) — `sendFallback()`

**✔️ Done cuando:** el bot toma un pedido de punta a punta y tus evals dan >85% de acierto.

---

## ✅ FASE 3 — Tests + Hardening
> Tu repo tiene CERO tests. Es tu agujero de credibilidad #1.

- [ ] **3.1** Instalar Vitest + setup
- [ ] **3.2** 🔒 Tests de **aislamiento multi-tenant** (lo más crítico: que tenant A nunca vea datos de B)
- [ ] **3.3** Test del camino crítico: `webhook → ingest → IA → send`
- [ ] **3.4** Rate limiting básico en el webhook público
- [ ] **3.5** Logging mínimo estructurado (no solo `console.log`)

**✔️ Done cuando:** `npm test` pasa y cubre el aislamiento de tenants + el flujo de pedido.

---

## ✅ FASE 4 — Demo + Caso de Estudio (tu material de venta)
> Sin esto no vendes nada. Con esto, vendes sin CV.

- [ ] **4.1** Seed de un tenant demo creíble (negocio del Eje: hostal, café o restaurante)
- [ ] **4.2** 🎥 Video de 90 seg: el bot tomando un pedido/reserva SOLO por WhatsApp
- [ ] **4.3** Demo accesible (link o grabación) para mostrar en vivo
- [ ] **4.4** Writeup corto: "Cómo automaticé pedidos por WhatsApp con IA"
- [ ] **4.5** Definir tu OFERTA escrita + precio (setup $300-1,200 + $50-300/mes)
- [ ] **4.6** Mensaje de outreach (plantilla para contactar negocios del Eje)

**✔️ Done cuando:** tienes video + oferta + mensaje listos para enviar a 10 negocios.

---

## ⏰ AGENDA DIARIA (rutina constante)
> Ajusta las horas a tu realidad. La clave es el ORDEN y la CONSTANCIA, no la cantidad.
> Bloques de ~4-5 hrs productivas. Si solo tienes 2-3 hrs, haz Bloque A + el mini de Distribución.

```
┌──────────────────────────────────────────────────────────────┐
│  🌅 BLOQUE A — DEEP WORK (construir)            90-120 min     │
│  La tarea técnica de la fase actual. Sin celular. 1 sola cosa. │
├──────────────────────────────────────────────────────────────┤
│  ☕ Descanso                                     15 min         │
├──────────────────────────────────────────────────────────────┤
│  📚 BLOQUE B — APRENDER                          45-60 min     │
│  Lo mínimo de la fase: evals, Vitest, n8n, o inglés.           │
├──────────────────────────────────────────────────────────────┤
│  🍽️ Almuerzo / pausa larga                                     │
├──────────────────────────────────────────────────────────────┤
│  📣 BLOQUE C — DISTRIBUIR                        45-60 min     │
│  (Sem 1-3: 20 min) Grabar/editar 1 video, o escribir/enviar    │
│  outreach. ⚠️ NO SALTAR este bloque aunque el código pique.    │
├──────────────────────────────────────────────────────────────┤
│  🗣️ BLOQUE D — INGLÉS                            20-30 min     │
│  App + 1 conversación o shadowing. Todos los días, corto.      │
└──────────────────────────────────────────────────────────────┘
```

---

## 📅 RITMO SEMANAL

| Día        | Foco principal                                    |
|------------|---------------------------------------------------|
| **Lun**    | Planear semana + arrancar tarea técnica de la fase |
| **Mar**    | Construir + grabar 1 video                          |
| **Mié**    | Construir + aprender (evals/tests)                  |
| **Jue**    | Construir + grabar 1 video                          |
| **Vie**    | Cerrar tarea de la fase + publicar contenido        |
| **Sáb**    | Outreach (contactar negocios) + editar videos       |
| **Dom**    | Descanso / revisar métricas de la semana            |

---

## 📊 MÉTRICAS (revisar cada domingo)

| Métrica                          | Meta semanal (desde Sem 4) |
|----------------------------------|----------------------------|
| ✅ Tareas de fase completadas     | Las de la semana            |
| 🎥 Videos publicados              | 2-3                         |
| 📩 Negocios contactados           | 10-15                       |
| 💬 Conversaciones de venta        | 2-3                         |
| 🗣️ Días que practiqué inglés      | 6-7                         |

> **Si una semana programaste mucho pero contactaste 0 negocios → esa semana FALLÓ,
> por bien que haya quedado el código.**

---

## 🎯 LO ÚNICO QUE IMPORTA AHORA

```
   TERMINAR (4 semanas)  →  DEMO  →  PUBLICAR + CONTACTAR  →  1er CLIENTE
        ▲                                                         │
        └──────────────  no programes features nuevas  ──────────┘
                         hasta tener el 1er cliente
```
