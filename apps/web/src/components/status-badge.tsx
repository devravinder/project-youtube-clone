import { Badge } from "./ui";

const TONES = { READY: "success", FAILED: "danger" } as const;

export function StatusBadge({ status }: { readonly status: string }) {
  const tone = TONES[status as keyof typeof TONES] ?? "neutral";
  return <Badge tone={tone}>{status.toLowerCase()}</Badge>;
}
