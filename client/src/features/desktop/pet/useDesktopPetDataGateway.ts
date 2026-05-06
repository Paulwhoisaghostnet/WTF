import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import type {
  PetActionMutationInput,
  PetResponse,
} from "../DesktopPetTypes";

export function useDesktopPetDataGateway(enabled: boolean) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["desktop", "pet"],
    queryFn: () => api.get<PetResponse>("/api/desktop/pet"),
    enabled,
    refetchInterval: enabled ? 60_000 : false,
  });

  const actionMutation = useMutation({
    mutationFn: (request: PetActionMutationInput) => {
      const action = typeof request === "string" ? request : request.action;
      const metadata = typeof request === "string" ? {} : request.metadata ?? {};
      return api.post<PetResponse & { xpAmount: number }>("/api/desktop/pet/actions", {
        action,
        metadata: { surface: "desktop_pet", ...metadata },
      });
    },
    onSuccess: (result) => {
      qc.setQueryData(["desktop", "pet"], (prev: PetResponse | undefined) => ({
        pet: result.pet,
        events: prev?.events ?? [],
      }));
      qc.invalidateQueries({ queryKey: ["auth", "user"] });
      qc.invalidateQueries({ queryKey: ["desktop", "pet"] });
    },
  });

  return { data, actionMutation };
}
