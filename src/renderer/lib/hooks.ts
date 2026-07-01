import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppSettings } from "../../shared/types";

export function useSettingsQuery() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => window.mirrow.settings.get(),
  });
}

export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<AppSettings>) => window.mirrow.settings.update(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["lmstudio-status"] });
      queryClient.invalidateQueries({ queryKey: ["google-ai-models"] });
    },
  });
}

export function useLmStudioStatusQuery() {
  return useQuery({
    queryKey: ["lmstudio-status"],
    queryFn: () => window.mirrow.lmStudio.checkConnection(),
    refetchInterval: 5_000,
  });
}

export function useGoogleAiModelsQuery(settings: Partial<AppSettings>, enabled: boolean) {
  return useQuery({
    queryKey: ["google-ai-models"],
    queryFn: () => window.mirrow.googleAi.listModels(settings),
    enabled,
  });
}

export function useHistoryQuery() {
  return useQuery({
    queryKey: ["history"],
    queryFn: () => window.mirrow.history.get(),
  });
}

export function useClearHistoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => window.mirrow.history.clear(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["history"] }),
  });
}
