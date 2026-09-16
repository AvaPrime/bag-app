import { Link, useRouterState } from "@tanstack/react-router";
import { GateMark } from "@/components/logo";
import { useBag } from "@/lib/bag/store";
import { cn } from "@/lib/cn";

const NAV = [
  { to: "/", label: "Overview" },
  { to: "/demo", label: "Flagship" },
  { to: "/refusal", label: "Refusal" },
  { to: "/audit", label: "Self-audit" },
  { to: "/verify", label: "Evidence" },
  { to: "/zk", label: "ZK" },
  { to: "/mpc", label: "MPC" },
  { to: "/boundary", label: "Boundary" },
  { to: "/pilot", label: "Pilot" },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const identity = useBag((s) => s.identity);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1280px] items-center gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-2.5 text-fg">
            <GateMark className="size-6 shrink-0" />
            <span className="truncate text-sm font-medium tracking-tight">
              Browser Agent Gateway
            </span>
          </Link>
          <nav className="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV.map((item) => {
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "shrink-0 rounded-sm px-2.5 py-2 text-sm transition-colors duration-150",
                    active ? "text-fg" : "text-subtle hover:text-fg",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {identity ? (
            <div
              className="hidden shrink-0 items-center gap-2 sm:flex"
              title="Generated in this browser. Not the production Gateway’s key."
            >
              <span className="size-1.5 rounded-full bg-verified" />
              <span className="font-mono text-[11px] text-subtle">{identity.kid}</span>
              <span className="hidden font-mono text-[11px] text-faint lg:inline">demo</span>
              <span className="hidden font-mono text-[11px] text-faint xl:inline">
                {identity.fingerprint}
              </span>
            </div>
          ) : (
            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              <span className="size-1.5 rounded-full bg-pending" />
              <span className="font-mono text-[11px] text-subtle">provisioning identity</span>
            </div>
          )}
        </div>
      </header>
      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">{children}</div>
    </div>
  );
}
