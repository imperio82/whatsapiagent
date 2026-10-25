import { NextResponse } from "next/server";
import { VoiceController } from "@modules/voice/interface/voice.controller";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new VoiceController();

/** El audio de una nota de voz del chat, solo para el negocio dueño de la conversación. */
export const GET = withRequestContext(async (req) => {
  const clip = await controller.clip(new URL(req.url).pathname.split("/").at(-1)!);
  return new NextResponse(new Uint8Array(clip.data), {
    headers: {
      "Content-Type": clip.mimeType,
      "Content-Length": String(clip.data.length),
      "Cache-Control": "private, max-age=86400",
    },
  });
});
