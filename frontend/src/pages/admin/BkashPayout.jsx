import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LuWallet,
  LuPlus,
  LuDownload,
  LuSend,
  LuTriangleAlert,
  LuCircleCheck,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";

// bKash bulk payout: fund the wallet, build a run, execute it.
//
// ============================================================================
// WHERE THE MONEY IS AT EVERY MOMENT
// ============================================================================
//
//     Cash on Hand  =  office cash  +  bKash wallet
//
// Topping up is a TRANSFER between two pockets the estate owns, so Cash on Hand
// does not move. Money leaves the estate when a worker is paid, and that posts
// through the same withdrawal path it always has.
//
// Getting that split wrong is the double-count this whole screen exists to
// avoid: if a top-up also reduced Cash on Hand, the same taka would be counted
// out twice — once funding the wallet, once paying the wage.
//
// The pink panel is a SIMULATION of a corporate disbursement portal. There is
// no bKash integration; the transaction ids are prefixed SIM so nobody mistakes
// them for real ones in an audit trail.

const CARD = "min-w-0 rounded-2xl bg-white p-4 shadow ring-1 ring-cg-green/10 sm:p-5";
const taka = (v) => "৳" + Number(v || 0).toLocaleString("en-IN");

export default function BkashPayout() {
  const [acc, setAcc] = useState(null);
  const [rows, setRows] = useState([]);
  const [batch, setBatch] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [topUp, setTopUp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  // Rows on an uploaded slip that could NOT be matched, with the reason.
  // Shown rather than swallowed: an admin who uploads eight rows and pays six
  // needs to know which two, and why, before telling anyone they were paid.
  const [skipped, setSkipped] = useState([]);

  const load = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([
        api.get("/bkash/account"),
        api.get("/bkash/payable"),
      ]);
      setAcc(a.data);
      setRows(p.data || []);
      setError("");
    } catch (err) {
      setError(apiError(err, "Could not load the bKash wallet."));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const total = useMemo(
    () => rows.filter((r) => picked.has(r.withdrawalId))
              .reduce((s, r) => s + Number(r.amount || 0), 0),
    [rows, picked],
  );

  const short = acc ? total - Number(acc.balance || 0) : 0;

  const toggle = (id) =>
    setPicked((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const doTopUp = async () => {
    setBusy(true); setError(""); setNote("");
    try {
      const { data } = await api.post("/bkash/top-up", { amount: Number(topUp) });
      setAcc(data);
      setTopUp("");
      setNote(
        `Wallet funded. Cash on Hand is unchanged — the money moved from the ` +
        `office into the estate's own wallet, it did not leave the estate.`,
      );
    } catch (err) {
      setError(apiError(err, "Could not top up the wallet."));
    } finally {
      setBusy(false);
    }
  };

  const buildBatch = async () => {
    setBusy(true); setError(""); setNote("");
    try {
      const { data } = await api.post("/bkash/batches", {
        withdrawalIds: [...picked],
      });
      const full = await api.get(`/bkash/batches/${data.id}`);
      setBatch(full.data);
      setConfirming(false);
    } catch (err) {
      setError(apiError(err, "Could not build the batch."));
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------------ import
  //
  // Read back a slip the Withdrawals screen produced.
  //
  // THIS DOES NOT PAY ANYBODY. It builds the same draft batch that ticking the
  // rows by hand would build, and Send below remains a separate, deliberate
  // press. Importing and paying being one action is exactly the shape that gets
  // money sent by accident.
  //
  // The server decides what each row means. It matches on CG id AND phone
  // against the worker record, and takes the amount from withdrawal_request --
  // never from the file. So a slip edited in a text editor cannot redirect a
  // payment or inflate one; it can only fail to match, which is reported below
  // row by row rather than silently dropped.
  const importSlip = async (file) => {
    if (!file) return;
    setBusy(true); setError(""); setNote(""); setSkipped([]);
    try {
      const form = new FormData();
      form.append("file", file);
      // No explicit Content-Type: the browser must set it so the multipart
      // boundary is included. Setting it by hand omits the boundary and the
      // server rejects the body.
      const { data } = await api.post("/bkash/batches/import", form);
      const full = await api.get(`/bkash/batches/${data.id}`);
      setBatch(full.data);
      setSkipped(data.skipped || []);
      setConfirming(false);
      setNote(
        `${data.matched} row(s) matched into ${data.reference}. ` +
        `Nothing has been paid yet — press Send below to pay them.`,
      );
      load();
    } catch (err) {
      setError(apiError(err, "Could not read that slip."));
    } finally {
      setBusy(false);
    }
  };

  // The artefact a real corporate bKash arrangement is fed: one row per wallet.
  const downloadCsv = () => {
    if (!batch) return;
    const csv =
      "wallet_number,receiver_name,amount,reference\n" +
      batch.items
        .map((i) => `${i.phone},${i.name},${i.amount},${batch.reference}-${i.workerId}`)
        .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${batch.reference}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const sendBatch = async () => {
    setBusy(true); setError("");
    try {
      const { data } = await api.post(`/bkash/batches/${batch.id}/send`);
      const full = await api.get(`/bkash/batches/${batch.id}`);
      setBatch(full.data);
      setAcc((a) => ({ ...a, balance: data.walletBalance }));
      setPicked(new Set());
      setConfirming(false);
      setNote(
        `${data.paid} workers paid, ${taka(data.moved)} moved. Each payment ` +
        `posted to Finance and texted the worker. Wallet now ${taka(data.walletBalance)}.`,
      );
      load();
    } catch (err) {
      setError(apiError(err, "Could not send the batch."));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const sent = batch?.status === "sent";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-cg-ink sm:text-3xl">
          bKash payout
        </h1>
        <p className="text-sm text-cg-ink/60">
          Fund the estate wallet, build a disbursement run from approved
          withdrawal requests, and pay every worker in one go.
        </p>
      </div>

      {/* ==================================================================
          PERMANENT SIMULATION NOTICE.
          ==================================================================
          The pink portal further down carries a SIMULATED badge, but it only
          renders once a batch exists ({batch && ...}). Until then this page
          showed a wallet with a real balance and a list of real workers owed
          real money, with nothing anywhere saying no bKash API is involved.
          Someone glancing at it -- an examiner, most likely -- could reasonably
          read it as a live payment console.

          CLAUDE.md section 2 requires the SIMULATED framing to stay. "Stays
          once you have built a batch" is not the same promise, so this says it
          from the moment the page opens. */}
      <div
        data-testid="bkash-simulation-notice"
        className="rounded-xl bg-[#fff6fa] px-4 py-3 text-sm text-[#8a1247] ring-1 ring-[#f4b8d3]"
      >
        <span className="font-bold">Simulation.</span> No bKash API is called and
        no real money moves. Transaction IDs are prefixed{" "}
        <span className="font-mono font-bold">SIM</span>. The wallet balance and
        the Finance ledger are real and do reconcile with each other.
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
      )}
      {note && (
        <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          <LuCircleCheck size={15} className="mt-0.5 shrink-0" /> {note}
        </p>
      )}

      {/* ---- wallet ---- */}
      <div className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-cg-ink/50">
              <LuWallet size={15} /> Estate bKash wallet
            </p>
            <p className="mt-1 truncate text-3xl font-extrabold tabular-nums text-[#E2136E]">
              {acc ? taka(acc.balance) : "…"}
            </p>
            <p className="text-xs text-cg-ink/50">{acc?.walletNumber}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-cg-ink/60">
              Move office cash in
              <input
                value={topUp}
                onChange={(e) => setTopUp(e.target.value)}
                type="number"
                min="1"
                placeholder="50000"
                className="mt-1 block w-36 rounded-lg border border-cg-green/25 px-3 py-2 text-sm outline-none focus:border-cg-green"
              />
            </label>
            <button
              className={BTN_DARK}
              disabled={busy || !Number(topUp)}
              onClick={doTopUp}
            >
              <LuPlus size={15} /> Top up
            </button>
          </div>
        </div>
        <p className="mt-3 rounded-lg bg-[#F4FFE9] px-3 py-2 text-[11px] leading-snug text-cg-ink/60">
          A top-up does <b>not</b> change Cash on Hand. Cash on Hand is office
          cash plus this wallet — the money has moved pocket, not left the
          estate. It is recorded in Finance so the transfer is visible, and it
          reduces cash only when a worker is actually paid.
        </p>
      </div>

      {/* ---- import a slip ---- */}
      {!batch && (
        <div className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-cg-green/10">
          <div className="bg-[#C0F28B] px-4 py-3">
            <h2 className="font-bold text-cg-ink">Upload a payout slip</h2>
          </div>
          <div className="px-4 py-4">
            <p className="text-sm text-cg-ink/70">
              The slip the office downloaded when it approved these withdrawals.
              Uploading it builds the run; it does not pay anyone.
            </p>
            <label className="mt-3 flex cursor-pointer flex-wrap items-center gap-3">
              <span className={BTN_GHOST}>Choose slip…</span>
              <input
                data-testid="bkash-slip-upload"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  // Clear the input so choosing the SAME file twice still fires
                  // onChange. Without this a failed import cannot be retried
                  // without picking a different file first.
                  e.target.value = "";
                  importSlip(f);
                }}
              />
              <span className="text-xs text-cg-ink/50">
                CSV with cg_id, name, phone, amount
              </span>
            </label>

            {skipped.length > 0 && (
              <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                <p className="font-bold">
                  {skipped.length} row(s) on that slip were not included:
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {skipped.map((s, i) => (
                    <li key={i}>
                      Line {s.line}
                      {s.name ? ` (${s.name})` : ""}: {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- pick ---- */}
      {!batch && (
        <div className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-cg-green/10">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-4 py-3">
            <h2 className="font-bold text-cg-ink">Withdrawal requests waiting</h2>
            <span className="text-xs font-semibold text-cg-ink/70">
              {picked.size} chosen · {taka(total)}
            </span>
          </div>
          <ul className="divide-y divide-cg-green/10">
            {rows.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-cg-ink/50">
                No pending requests. A worker has to tap বেতন তুলুন first.
              </li>
            ) : (
              rows.map((r) => (
                <li key={r.withdrawalId}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      checked={picked.has(r.withdrawalId)}
                      onChange={() => toggle(r.withdrawalId)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-cg-ink">
                        {r.name}
                      </span>
                      <span className="block truncate text-[11px] text-cg-ink/55">
                        {r.code} · {r.phone} · {r.kind}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-cg-ink">
                      {taka(r.amount)}
                    </span>
                  </label>
                </li>
              ))
            )}
          </ul>
          <div className="flex flex-wrap items-center gap-2 bg-[#D3FFAC] px-4 py-3">
            <button
              className={BTN_DARK}
              disabled={busy || picked.size === 0}
              onClick={buildBatch}
            >
              Build disbursement file →
            </button>
            {picked.size > 0 && short > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-700">
                <LuTriangleAlert size={13} />
                Wallet is {taka(short)} short — top up first.
              </span>
            )}
          </div>
        </div>
      )}

      {/* ---- the bKash portal ---- */}
      {batch && (
        <div className="overflow-hidden rounded-2xl border border-[#f4b8d3] bg-[#fff6fa]">
          <div className="flex flex-wrap items-center gap-2 bg-[#E2136E] px-4 py-3 text-white">
            <span className="rounded-lg bg-white px-2 py-0.5 font-black tracking-tight text-[#E2136E]">
              bKash
            </span>
            <span className="font-bold">Corporate Disbursement</span>
            {/* Labelled, always. A payment screen that does not say it is a
                simulation is the kind of thing that reads badly in a viva. */}
            <span className="ml-auto text-xs font-bold opacity-90">SIMULATED</span>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-cg-ink/50">Batch</p>
                <p className="font-extrabold text-cg-ink">{batch.reference}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-cg-ink/50">
                  {batch.itemCount} wallets
                </p>
                <p className="text-xl font-extrabold tabular-nums text-[#E2136E]">
                  {taka(batch.totalAmount)}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl bg-white ring-1 ring-[#f4b8d3]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-[#ffe9f2] text-[11px] uppercase tracking-wide text-cg-ink/60">
                    <th className="px-3 py-2">Wallet</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">TrxID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ffe1ee]">
                  {batch.items.map((i) => (
                    <tr key={i.id}>
                      <td className="px-3 py-2 font-mono text-xs">{i.phone}</td>
                      <td className="px-3 py-2">{i.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{taka(i.amount)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            i.status === "sent"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {i.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-cg-ink/60">
                        {i.trxId || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className={BTN_GHOST} onClick={downloadCsv}>
                <LuDownload size={15} /> Download CSV
              </button>

              {sent ? (
                <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-700">
                  <LuCircleCheck size={16} /> Batch sent
                </span>
              ) : !confirming ? (
                <button
                  className="inline-flex items-center gap-2 rounded-lg bg-[#E2136E] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  disabled={busy}
                  onClick={() => setConfirming(true)}
                >
                  <LuSend size={15} /> Disburse to all wallets
                </button>
              ) : (
                <>
                  {/* The two facts the admin is agreeing to, before the tap
                      that cannot be undone. */}
                  <span className="mr-auto flex items-start gap-1.5 text-[11px] text-cg-ink/70">
                    <LuTriangleAlert size={13} className="mt-0.5 shrink-0" />
                    Pays {batch.itemCount} workers {taka(batch.totalAmount)}, debits the
                    wallet, posts to Finance and texts each worker.
                  </span>
                  <button
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-cg-ink/60"
                    onClick={() => setConfirming(false)}
                  >
                    Back
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-lg bg-[#E2136E] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    disabled={busy}
                    onClick={sendBatch}
                  >
                    {busy ? "Sending…" : "Yes, disburse"}
                  </button>
                </>
              )}

              <button
                className={BTN_GHOST}
                onClick={() => { setBatch(null); load(); }}
              >
                {sent ? "New run" : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
