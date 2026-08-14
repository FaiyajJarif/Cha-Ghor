import { useEffect } from "react";
import { createPortal } from "react-dom";
import { LuX, LuPrinter } from "react-icons/lu";

// আমার বেতন স্লিপ — a printable payslip the worker can keep.
//
// WHY A WORKER NEEDS A PAPER COPY AT ALL
//   CHA_GHOR_IDEA.md §1: "There is no payslip." Everything upstream exists so
//   this document can be correct. On an estate a printed slip is what a worker
//   takes to a family member who reads, to a union rep, or to the office when
//   the figure is disputed — a screen they have to hand over is none of those.
//
// PRINT APPROACH copied from components/admin/PayslipDocument.jsx, including
// the one trap that made that file print blank pages:
//
//   #my-payslip-root MUST NOT be nested inside a .no-print element.
//   .no-print is display:none when printing, and a display:none ANCESTOR
//   cannot be undone by visibility on a descendant. So the visible modal and
//   the print root are siblings, and the content is written twice.
//
// A DRAFT IS STAMPED AS ONE. A provisional figure printed on something that
// looks like a payslip is exactly how a mid-month number becomes a promise the
// estate never made.

const PRINT_CSS = `
#my-payslip-root { display: none; }
@media print {
  body * { visibility: hidden !important; }
  #my-payslip-root, #my-payslip-root * { visibility: visible !important; }
  #my-payslip-root {
    display: block !important;
    position: absolute; left: 0; top: 0; width: 100%;
    padding: 24px; font-size: 12px; color: #000;
  }
  .no-print { display: none !important; }
  @page { margin: 14mm; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

const BN = "০১২৩৪৫৬৭৮৯";
const bn = (s) => String(s).replace(/[0-9]/g, (d) => BN[+d]);
const taka = (v) =>
  v == null ? "—" : "৳" + bn(Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 }));
const MONTHS_BN = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];
const monthLabel = (iso) => {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS_BN[d.getMonth()]} ${bn(d.getFullYear())}`;
};

const STATUS_BN = {
  draft: "খসড়া",
  review: "যাচাই চলছে",
  approved: "অনুমোদিত",
  paid: "পরিশোধিত",
};

// The same seven lines the wage engine computes, in the same order.
const ROWS = (p) => [
  ["মূল মজুরি", p.base, false],
  ["অতিরিক্ত পাতার মজুরি", p.surplus, false],
  ["'এ' গ্রেড বোনাস", p.gradeBonus, false],
  ["মোট আয়", p.gross, false, true],
  ["ঋণ কর্তন", p.loanDeduction, true],
  ["অগ্রিম সমন্বয়", p.advanceRecovery, true],
  ["অন্যান্য কর্তন", p.otherDeduction, true],
];

export default function MyPayslip({ open, period, worker, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !period) return null;

  const p = period;
  const sheet = (
    <>
      <div className="mb-4 border-b-2 border-black pb-2">
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>চা ঘর</h1>
        <p style={{ margin: "2px 0 0", fontSize: 12 }}>
          বেতন স্লিপ — {monthLabel(p.periodStart)}
        </p>
      </div>

      <table style={{ width: "100%", marginBottom: 12, fontSize: 12 }}>
        <tbody>
          <tr>
            <td>নাম</td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>
              {worker?.nameBn || worker?.fullName || "—"}
            </td>
          </tr>
          <tr>
            <td>কর্মী আইডি</td>
            <td style={{ textAlign: "right" }}>{worker?.code || "—"}</td>
          </tr>
          <tr>
            <td>ক্ষেত্র</td>
            <td style={{ textAlign: "right" }}>{worker?.zoneName || "—"}</td>
          </tr>
          <tr>
            <td>অবস্থা</td>
            <td style={{ textAlign: "right" }}>{STATUS_BN[p.status] || p.status}</td>
          </tr>
        </tbody>
      </table>

      {/* A draft is not a promise. Stamped, not footnoted. */}
      {p.provisional && (
        <p
          style={{
            border: "1px solid #000",
            padding: "6px 8px",
            marginBottom: 12,
            fontWeight: 700,
            fontSize: 11,
          }}
        >
          এটি চূড়ান্ত নয় — মাস শেষ হলে হিসাব বদলাতে পারে।
        </p>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <tbody>
          {ROWS(p).map(([label, value, negative, strong]) => (
            <tr key={label} style={{ borderBottom: "1px solid #ddd" }}>
              <td style={{ padding: "5px 0", fontWeight: strong ? 700 : 400 }}>
                {label}
              </td>
              <td
                style={{
                  padding: "5px 0",
                  textAlign: "right",
                  fontWeight: strong ? 700 : 400,
                }}
              >
                {negative && Number(value) !== 0 ? "− " : ""}
                {taka(value)}
              </td>
            </tr>
          ))}
          <tr style={{ borderTop: "2px solid #000" }}>
            <td style={{ padding: "8px 0", fontWeight: 700, fontSize: 14 }}>
              হাতে পাবেন
            </td>
            <td
              style={{
                padding: "8px 0",
                textAlign: "right",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {taka(p.netPayable)}
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ marginTop: 10, fontSize: 11 }}>
        মোট পাতা {bn(Number(p.leafKg || 0).toFixed(1))} কেজি · উপস্থিত{" "}
        {bn(p.presentDays ?? 0)} দিন
        {p.paidOn ? ` · পরিশোধ ${p.paidOn}` : ""}
      </p>
      <p style={{ marginTop: 14, fontSize: 10 }}>
        হিসাব ভুল মনে হলে অফিসে জানান। নেট কখনো শূন্যের নিচে যায় না — বাকি
        থাকলে তা ঋণেই থেকে যায়।
      </p>
    </>
  );

  return createPortal(
    <>
      <style>{PRINT_CSS}</style>

      <div className="no-print fixed inset-0 z-[1200] bg-black/40" onClick={onClose} />
      <div className="no-print fixed inset-0 z-[1210] flex items-center justify-center p-4">
        <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold text-[#14493B]">বেতন স্লিপ</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="বন্ধ করুন"
              className="grid h-9 w-9 place-items-center rounded-full bg-[#F4FFE9] text-[#14493B]"
            >
              <LuX size={17} />
            </button>
          </div>

          <div className="text-[#14493B]">{sheet}</div>

          <button
            type="button"
            onClick={() => window.print()}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#14493B] px-6 py-3.5 text-base font-extrabold text-white"
          >
            <LuPrinter size={18} /> ছাপুন বা সেভ করুন
          </button>
        </div>
      </div>

      {/* Print-only copy. MUST remain a SIBLING of the .no-print blocks above —
          nesting it inside them is what makes this print blank pages. */}
      <div id="my-payslip-root">{sheet}</div>
    </>,
    document.body,
  );
}
