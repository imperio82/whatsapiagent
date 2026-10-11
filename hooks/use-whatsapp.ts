"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  whatsappService,
  type SaveMetaInput,
  type SaveTwilioInput,
} from "@services/whatsapp.service";

const KEY = "whatsapp-status";
const ACCOUNT_KEY = "whatsapp-account";

export function useWhatsappStatus(pollMs = 2500) {
  return useQuery({
    queryKey: [KEY],
    queryFn: () => whatsappService.getStatus(),
    refetchInterval: pollMs,
    refetchIntervalInBackground: true,
  });
}

export function useConnectWhatsapp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => whatsappService.connect(),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDisconnectWhatsapp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => whatsappService.disconnect(),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useMessagingAccount() {
  return useQuery({
    queryKey: [ACCOUNT_KEY],
    queryFn: () => whatsappService.getAccount(),
  });
}

export function useSaveTwilioAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveTwilioInput) => whatsappService.saveTwilioAccount(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ACCOUNT_KEY] });
      qc.invalidateQueries({ queryKey: [KEY] });
    },
  });
}

export function useSaveMetaAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveMetaInput) => whatsappService.saveMetaAccount(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ACCOUNT_KEY] });
      qc.invalidateQueries({ queryKey: [KEY] });
    },
  });
}
