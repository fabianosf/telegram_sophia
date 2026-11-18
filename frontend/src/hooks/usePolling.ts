import { useCallback, useEffect, useState } from "react";

export function usePolling<T>(loader: () => Promise<T[]>, intervalMs: number) {
  const [data, setData] = useState<T[]>([]);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      setData((await loader()) ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar.");
    }
  }, [loader]);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => {
      void reload();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, reload]);

  return { data, error, reload, setData };
}
