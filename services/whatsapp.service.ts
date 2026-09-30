import { api } from "./api-client";
import type { ConnectionState } from "@modules/whatsapp/domain/ports/whatsapp-provider";

export interface WhatsAppStatus {
  provider: "baileys" | "meta" | "twilio";
  state: ConnectionState;
}

export interface MessagingAccount {
  provider: string;
  displayPhoneNumber: string | null;
  twilioAccountSid: string | null;
  hasAuthToken: boolean;
  verified: boolean;
}

export interface SaveTwilioInput {
  twilioAccountSid: string;
  twilioAuthToken: string;
  displayPhoneNumber: string;
}

export const whatsappService = {
  getStatus: () => api.get<WhatsAppStatus>("/api/v1/whatsapp/state"),
  connect: () => api.post<WhatsAppStatus>("/api/v1/whatsapp/connect"),
  disconnect: () => api.delete<WhatsAppStatus>("/api/v1/whatsapp/connect"),
  getAccount: () => api.get<MessagingAccount | null>("/api/v1/whatsapp/account"),
  saveTwilioAccount: (input: SaveTwilioInput) =>
    api.patch<MessagingAccount>("/api/v1/whatsapp/account", input),
};
