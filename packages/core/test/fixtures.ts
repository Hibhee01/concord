import type { AssetEvent, EventKind } from "../src/index.js";

let seq = 0;
const T0 = Date.parse("2026-10-01T00:00:00Z");

/** Ledger n closes n minutes after T0. */
export function ev(
	 kind: EventKind,
	 ledger: number,
	 fields: Partial<Pick<AssetEvent, "from" | "to" | "authorized" | "txHash">> & { amount?: bigint } = {},
): AssetEvent {
	 seq++;
	 return {
	   id: `${String(ledger).padStart(10, "0")}-${String(seq).padStart(10, "0")}`,
	   assetId: "CASSET",
	   kind,
	   ledger,
	   closedAt: new Date(T0 + ledger * 60_000).toISOString(),
	   txHash: fields.txHash ?? `tx${seq}`,
	   amount: fields.amount ?? 0n,
	   ...(fields.from ? { from: fields.from } : {}),
	   ...(fields.to ? { to: fields.to } : {}),
	   ...(fields.authorized !== undefined ? { authorized: fields.authorized } : {}),
	 };
}

export const u = (n: number) => BigInt(n) * 10_000_000n;
