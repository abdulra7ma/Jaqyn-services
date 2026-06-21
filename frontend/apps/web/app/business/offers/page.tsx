"use client";

// Group Deals (OwnerShell design, responsive), wired to the backend:
// - stats from /api/business/dashboard/ metrics
// - your group offer from /api/business/group-offers/ (+ create, +toggle)
// - "Active groups today" from /api/business/group-deals/

import {
  useBusinessGroupDeals,
  useBusinessOffers,
  useCreateOffer,
  useDashboard,
  useDeleteOffer,
  useOfferAction,
  useUpdateOffer,
  type BusinessGroupDeal,
  type GroupOfferFull,
} from "@jaqyn/api";
import { useRef, useState } from "react";
import { OwnerShell } from "../_components/OwnerShell";
import { useAuth } from "../../_lib/auth";

const CARD = "rounded-[18px] border border-line bg-card p-5";
const FIELD =
  "w-full rounded-xl border-[1.5px] border-line bg-card px-3 py-3 text-sm font-semibold text-ink outline-none transition focus:border-brand";
const LABEL = "text-xs font-bold text-subtle";

const GROUP_STATUS: Record<string, { label: string; cls: string }> = {
  completed: { label: "Completed", cls: "bg-sage-soft text-ok" },
  checking_in: { label: "Checking in", cls: "bg-brand-muted text-danger" },
  full: { label: "Full", cls: "bg-[#FBEFD9] text-amber-deep" },
  scheduled: { label: "Scheduled", cls: "bg-[#FBEFD9] text-amber-deep" },
  forming: { label: "Forming", cls: "bg-[#FBEFD9] text-amber-deep" },
};

const ALL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function fmtTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toTimeString().slice(0, 5);
}

export default function BusinessOffersPage() {
  const { isAuthenticated, ready } = useAuth();
  const enabled = ready && isAuthenticated;
  const dash = useDashboard(enabled);
  const offers = useBusinessOffers();
  const deals = useBusinessGroupDeals(enabled);
  const create = useCreateOffer();
  const updateOffer = useUpdateOffer();
  const deleteOffer = useDeleteOffer();
  const action = useOfferAction();
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", reward_description: "", min_group_size: 4, max_group_size: 8 });

  const m = dash.data?.metrics;
  const offerList = offers.data ?? [];
  const groups = deals.data ?? [];
  const scroller = useRef<HTMLDivElement>(null);

  function scrollBy(dir: 1 | -1) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.85), behavior: "smooth" });
  }

  const OFFER_STATUS: Record<string, { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-sage-soft text-ok" },
    draft: { label: "Draft", cls: "bg-board/60 text-subtle" },
    pending_approval: { label: "Pending approval", cls: "bg-[#FBEFD9] text-amber-deep" },
    paused: { label: "Paused", cls: "bg-board/60 text-subtle" },
    rejected: { label: "Rejected", cls: "bg-brand-muted text-danger" },
    expired: { label: "Expired", cls: "bg-brand-muted text-danger" },
  };

  const stats = [
    { label: "Groups created", value: (m?.active_groups ?? 0) + (m?.completed_groups ?? 0), sub: "" },
    {
      label: "Completed",
      value: m?.completed_groups ?? 0,
      sub: m ? `${Math.round((m.group_completion_rate ?? 0) * 100)}% rate` : "",
      accent: true,
    },
    { label: "Customers brought", value: m?.customers ?? 0, sub: m ? `${m.new_customers ?? 0} new` : "", accent: true },
    { label: "Est. revenue", value: m ? `${m.estimated_revenue} c` : "—", sub: "" },
  ];

  function openCreate() {
    setEditId(null);
    setForm({ title: "", reward_description: "", min_group_size: 4, max_group_size: 8 });
    setOpen(true);
  }
  function openEdit(o: GroupOfferFull) {
    setEditId(o.id);
    setForm({
      title: o.title,
      reward_description: o.reward_description,
      min_group_size: o.min_group_size,
      max_group_size: o.max_group_size ?? 8,
    });
    setOpen(true);
  }

  const saving = create.isPending || updateOffer.isPending;

  function submitForm() {
    const close = () => {
      setOpen(false);
      setEditId(null);
      setForm({ title: "", reward_description: "", min_group_size: 4, max_group_size: 8 });
    };
    if (editId) {
      updateOffer.mutate(
        {
          id: editId,
          patch: {
            title: form.title.trim() || "Group deal",
            reward_description: form.reward_description.trim() || "Group reward",
            min_group_size: Number(form.min_group_size) || 4,
            max_group_size: Number(form.max_group_size) || null,
          },
        },
        { onSuccess: close },
      );
      return;
    }
    create.mutate(
      {
        title: form.title.trim() || "Group deal",
        description: form.reward_description.trim() || "Bring friends, unlock a reward together.",
        category: "cafe",
        reward_type: "group_discount",
        reward_description: form.reward_description.trim() || "Group reward",
        min_group_size: Number(form.min_group_size) || 4,
        max_group_size: Number(form.max_group_size) || null,
        valid_from: new Date().toISOString().slice(0, 10),
        valid_to: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
        valid_days: ALL_DAYS,
        time_start: "15:00",
        time_end: "18:00",
      },
      { onSuccess: close },
    );
  }

  return (
    <OwnerShell title="Group Deals">
      {!ready ? null : !isAuthenticated ? (
        <div className={`${CARD} max-w-md`}>
          <p className="text-sm text-subtle">Sign in to manage your group deals.</p>
        </div>
      ) : (
        <div className="animate-[jqIn_.3s_ease]">
          {/* stats */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className={CARD}>
                <div className="text-[12.5px] font-semibold text-subtle">{s.label}</div>
                <div className="mt-3 font-display text-[28px] font-extrabold leading-none text-ink sm:text-[34px]">
                  {dash.isLoading ? "—" : s.value}
                </div>
                {s.sub && <div className={`mt-2.5 text-xs font-semibold ${s.accent ? "text-brand" : "text-subtle"}`}>{s.sub}</div>}
              </div>
            ))}
          </div>

          {/* your group offers */}
          <div className="mt-7 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="font-display text-base font-bold text-ink">
                Your group {offerList.length === 1 ? "offer" : "offers"}
              </div>
              {offerList.length > 1 && <span className="text-[12.5px] text-subtle">{offerList.length}</span>}
            </div>
            <div className="flex items-center gap-2">
              {offerList.length > 1 && (
                <>
                  <button onClick={() => scrollBy(-1)} aria-label="Previous offer" className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-ink">
                    ‹
                  </button>
                  <button onClick={() => scrollBy(1)} aria-label="Next offer" className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-ink">
                    ›
                  </button>
                </>
              )}
              <button onClick={openCreate} className="rounded-[13px] bg-brand px-4 py-2.5 text-[13.5px] font-bold text-brand-fg shadow-glow">
                + Create group offer
              </button>
            </div>
          </div>

          {offers.isLoading ? (
            <div className={`${CARD} mt-3.5 text-subtle`}>Loading offers…</div>
          ) : offerList.length === 0 ? (
            <div className={`${CARD} mt-3.5 text-center text-[13.5px] text-subtle`}>
              No group offer yet — create one so customers can visit together and unlock rewards.
            </div>
          ) : (
            <div
              ref={scroller}
              className="mt-3.5 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {offerList.map((o: GroupOfferFull) => {
                const st = OFFER_STATUS[o.status] ?? { label: o.status, cls: "bg-board/60 text-subtle" };
                const isDraft = o.status === "draft" || o.status === "rejected";
                return (
                  <div
                    key={o.id}
                    className={`flex shrink-0 snap-start flex-col rounded-[18px] border border-line bg-card p-6 ${
                      offerList.length > 1 ? "w-[88%] sm:w-[440px]" : "w-full"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="rounded-pill bg-[#FBEFD9] px-2.5 py-1 text-[11.5px] font-bold text-amber-deep">Group discount</span>
                        <div className="mt-3 font-display text-xl font-bold text-ink">{o.title}</div>
                        <div className="mt-1.5 text-[13px] text-subtle">
                          {o.min_group_size} people · {o.valid_days.length >= 7 ? "Daily" : o.valid_days.join(", ")},{" "}
                          {o.time_start?.slice(0, 5)}–{o.time_end?.slice(0, 5)} · max {o.max_group_size ?? "∞"}/group
                        </div>
                      </div>
                      <span className={`inline-flex flex-none items-center gap-[7px] rounded-pill px-3 py-1.5 text-xs font-bold ${st.cls}`}>
                        <span className={`h-[7px] w-[7px] rounded-full ${o.status === "active" ? "bg-sage-deep" : "bg-subtle"}`} />
                        {st.label}
                      </span>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button onClick={() => openEdit(o)} className="rounded-[13px] border-[1.5px] border-line bg-card px-5 py-3 text-[13.5px] font-semibold text-ink">
                        Edit offer
                      </button>
                      {isDraft && (
                        <button onClick={() => action.mutate({ id: o.id, action: "submit" })} disabled={action.isPending} className="rounded-[13px] bg-brand px-5 py-3 text-[13.5px] font-bold text-brand-fg shadow-glow disabled:opacity-60">
                          Submit for approval
                        </button>
                      )}
                      {o.status === "pending_approval" && (
                        <span className="rounded-[13px] bg-[#FBEFD9] px-5 py-3 text-[13.5px] font-bold text-amber-deep">Pending approval</span>
                      )}
                      {o.status === "active" && (
                        <button onClick={() => action.mutate({ id: o.id, action: "pause" })} disabled={action.isPending} className="rounded-[13px] border-[1.5px] border-line bg-card px-5 py-3 text-[13.5px] font-semibold text-ink disabled:opacity-60">
                          Pause · toggle
                        </button>
                      )}
                      {o.status === "paused" && (
                        <button onClick={() => action.mutate({ id: o.id, action: "activate" })} disabled={action.isPending} className="rounded-[13px] bg-brand px-5 py-3 text-[13.5px] font-bold text-brand-fg shadow-glow disabled:opacity-60">
                          Resume · toggle
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmDelete({ id: o.id, title: o.title })}
                        className="ml-auto rounded-[13px] border-[1.5px] border-line bg-card px-4 py-3 text-[13.5px] font-semibold text-danger"
                      >
                        Delete
                      </button>
                    </div>
                    {isDraft && (
                      <p className="mt-3 text-[12px] text-subtle">
                        New offers start as a draft. Submit for approval to go live — then customers can form groups against it.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* active groups today */}
          <div className="mt-8 font-display text-base font-bold text-ink">Active groups today</div>
          <div className="mt-3.5 overflow-hidden rounded-[18px] border border-line bg-card">
            <div className="hidden grid-cols-[1fr_1.2fr_0.8fr_1fr_1fr] gap-3 border-b border-line px-5 py-3 text-[11px] font-bold uppercase tracking-[0.05em] text-subtle sm:grid">
              <span>Group</span>
              <span>Leader</span>
              <span>Visit</span>
              <span>Members</span>
              <span>Status</span>
            </div>
            {deals.isLoading ? (
              <div className="px-5 py-10 text-center text-subtle">Loading groups…</div>
            ) : groups.length === 0 ? (
              <div className="px-5 py-12 text-center text-[13.5px] text-subtle">
                No active groups right now — they appear as customers form groups for your offer.
              </div>
            ) : (
              groups.map((g: BusinessGroupDeal, i: number) => {
                const st = GROUP_STATUS[g.status] ?? { label: g.status, cls: "bg-board/60 text-subtle" };
                return (
                  <div key={g.id} className="grid grid-cols-2 gap-2 border-b border-[#F4ECDF] px-5 py-3.5 text-[13.5px] sm:grid-cols-[1fr_1.2fr_0.8fr_1fr_1fr] sm:items-center sm:gap-3">
                    <span className="font-semibold text-ink">Group {String.fromCharCode(65 + i)}</span>
                    <span className="text-subtle sm:text-ink">{g.leader_name || "—"}</span>
                    <span className="text-subtle">{fmtTime(g.visit_time)}</span>
                    <span className="text-subtle">
                      {g.joined}/{g.target_size} · {g.checked_in}/{g.target_size} in
                    </span>
                    <span>
                      <span className={`rounded-pill px-2.5 py-1 text-[11.5px] font-bold ${st.cls}`}>{st.label}</span>
                    </span>
                  </div>
                );
              })
            )}
          </div>
          <p className="mt-3 text-[12px] text-subtle">Members column shows joined · checked-in. Staff verify and redeem from Staff Mode.</p>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-[440px] rounded-[20px] bg-card p-6 shadow-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-xl font-bold text-ink">{editId ? "Edit group offer" : "Create group offer"}</h3>
            <label className="mt-4 block">
              <span className={LABEL}>Offer title</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Group of 4, everyone gets 15% off" className={`${FIELD} mt-1.5`} />
            </label>
            <label className="mt-3.5 block">
              <span className={LABEL}>Reward</span>
              <input value={form.reward_description} onChange={(e) => setForm({ ...form, reward_description: e.target.value })} placeholder="15% off for the group" className={`${FIELD} mt-1.5`} />
            </label>
            <div className="mt-3.5 flex gap-3">
              <label className="flex-1">
                <span className={LABEL}>Group size</span>
                <input type="number" value={form.min_group_size} onChange={(e) => setForm({ ...form, min_group_size: Number(e.target.value) })} className={`${FIELD} mt-1.5`} />
              </label>
              <label className="flex-1">
                <span className={LABEL}>Max groups/day</span>
                <input type="number" value={form.max_group_size} onChange={(e) => setForm({ ...form, max_group_size: Number(e.target.value) })} className={`${FIELD} mt-1.5`} />
              </label>
            </div>
            {(create.isError || updateOffer.isError) && <p className="mt-3 text-sm text-danger">Could not save — check the fields.</p>}
            <div className="mt-5 flex gap-3">
              <button onClick={() => setOpen(false)} className="flex-1 rounded-xl border-[1.5px] border-line bg-card py-3 text-sm font-semibold text-ink">Cancel</button>
              <button onClick={submitForm} disabled={saving} className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-brand-fg shadow-glow disabled:opacity-60">
                {saving ? "Saving…" : editId ? "Save offer" : "Create offer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-[400px] rounded-[20px] bg-card p-6 shadow-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-xl font-bold text-ink">Delete this offer?</h3>
            <p className="mt-2 text-sm leading-relaxed text-subtle">
              “{confirmDelete.title}” will be permanently removed. Offers that already have groups can’t be deleted.
            </p>
            {deleteOffer.isError && (
              <p className="mt-3 text-sm font-semibold text-danger">
                {(deleteOffer.error as { message?: string })?.message ?? "Could not delete this offer."}
              </p>
            )}
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-xl border-[1.5px] border-line bg-card py-3 text-sm font-semibold text-ink">
                Keep
              </button>
              <button
                onClick={() =>
                  deleteOffer.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) })
                }
                disabled={deleteOffer.isPending}
                className="flex-1 rounded-xl bg-danger py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {deleteOffer.isPending ? "Deleting…" : "Delete offer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </OwnerShell>
  );
}
