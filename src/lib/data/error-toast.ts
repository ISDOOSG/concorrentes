import { toast } from "sonner";

export function toastDataError(err: unknown, fallback = "Algo deu errado") {
  const msg = err instanceof Error ? err.message : String(err);
  toast.error(msg || fallback);
}
