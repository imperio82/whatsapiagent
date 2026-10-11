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
  phoneNumberId: string | null;
  businessAccountId: string | null;
  hasAccessToken: boolean;
  verified: boolean;
}

export interface SaveTwilioInput {
  twilioAccountSid: string;
  twilioAuthToken: string;
  displayPhoneNumber: string;
}

export interface SaveMetaInput {
  phoneNumberId: string;
  businessAccountId?: string;
  accessToken: string;
}

export const whatsappService = {
  getStatus: () => api.get<WhatsAppStatus>("/api/v1/whatsapp/state"),
  connect: () => api.post<WhatsAppStatus>("/api/v1/whatsapp/connect"),
  disconnect: () => api.delete<WhatsAppStatus>("/api/v1/whatsapp/connect"),
  getAccount: () => api.get<MessagingAccount | null>("/api/v1/whatsapp/account"),
  saveTwilioAccount: (input: SaveTwilioInput) =>
    api.patch<MessagingAccount>("/api/v1/whatsapp/account", input),
  saveMetaAccount: (input: SaveMetaInput) =>
    api.patch<MessagingAccount>("/api/v1/whatsapp/account", { provider: "meta", ...input }),
};
