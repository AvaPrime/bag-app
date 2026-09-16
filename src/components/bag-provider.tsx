import { useEffect, type ReactNode } from "react";
import { useBag } from "@/lib/bag/store";

export function BagProvider({ children }: { children: ReactNode }) {
  const boot = useBag((s) => s.boot);

  useEffect(() => {
    void boot();
  }, [boot]);

  return children;
}
