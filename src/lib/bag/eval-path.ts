export const EVAL_PATH = [
  { to: "/", label: "Overview" },
  { to: "/demo", label: "Flagship" },
  { to: "/refusal", label: "Refusal" },
  { to: "/audit", label: "Self-audit" },
  { to: "/verify", label: "Evidence" },
] as const;

export const EVAL_REF = [
  { to: "/boundary", label: "Boundary" },
  { to: "/zk", label: "ZK" },
  { to: "/mpc", label: "MPC" },
  { to: "/pilot", label: "Pilot" },
] as const;

export type EvalPathTo = (typeof EVAL_PATH)[number]["to"];

export function isEvalPath(pathname: string): pathname is EvalPathTo {
  return EVAL_PATH.some((item) => item.to === pathname);
}
