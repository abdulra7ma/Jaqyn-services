"use client";

// Manage Staff (business owner) — translated from Jaqyn.dc.html "Manage Staff"
// table + slide-in staff detail drawer + invite modal. Wired to the team hooks
// (useTeam / member mutations) plus the existing invite hooks for invite rows.
// Owner-gated like the other /business pages (useAuth → no render until ready).

import {
  useCreateStaffAccount,
  useReactivateStaff,
  useRemoveStaffInvite,
  useRemoveStaffMember,
  useResetStaffPassword,
  useSuspendStaff,
  useTeam,
  useUpdateStaffRole,
  type TeamCounts,
  type TeamRole,
  type TeamRow,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { AlertDialog, Badge, cn } from "@jaqyn/ui";
import { useState } from "react";
import { OwnerShell } from "../_components/OwnerShell";
import { InitialTile } from "../../_components/kit";
import { QueryBoundary } from "../../_components/QueryBoundary";
import { useErrMessage } from "../../_lib/useErrMessage";

// Status → Badge tone (design colors: active=sage/ok, invited=amber/warn,
// suspended=clay/danger).
const STATUS_TONE: Record<TeamRow["status"], "ok" | "warn" | "danger"> = {
  active: "ok",
  invited: "warn",
  suspended: "danger",
};

const TABLE_COLS = "grid grid-cols-[2.4fr_1.5fr_1.1fr_1fr_0.6fr] items-center gap-3";

// cashier/manager have i18n labels; any other role value (e.g. a pending invite's
// generic "staff") falls back to a title-cased version rather than a raw key.
function roleLabel(t: (k: string) => string, role: string): string {
  if (role === "cashier" || role === "manager") return t(`biz.staff.role.${role}`);
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : "—";
}

// Friendly date for joined/last-active (the API sends ISO timestamps).
function fmtWhen(iso: string | null, withTime = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export default function ManageStaffPage() {
  const t = useT();
  const team = useTeam();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  return (
    <OwnerShell title={t("biz.staff.title")}>
      <div className="max-w-[980px] animate-[jqIn_.3s_ease]">
          <div className="flex flex-wrap items-center justify-between gap-3.5">
            <p className="text-[13.5px] text-subtle">{t("biz.staff.subtitle")}</p>
            <button
              onClick={() => setInviteOpen(true)}
              className="whitespace-nowrap rounded-xl bg-brand px-[18px] py-[11px] text-[13.5px] font-semibold text-brand-fg transition active:scale-[.99]"
            >
              {t("staff.create.addButton")}
            </button>
          </div>

          <QueryBoundary query={team}>
            {(data) => (
              <>
                <StatCards counts={data.counts} />
                {data.members.length === 0 ? (
                  <div className="mt-4 rounded-[18px] border border-line bg-card px-6 py-12 text-center text-[13.5px] text-subtle">
                    {t("biz.staff.empty")}
                  </div>
                ) : (
                  <TeamTable rows={data.members} onManage={setDetailId} />
                )}
              </>
            )}
          </QueryBoundary>

          {detailId && (
            <StaffDrawer id={detailId} onClose={() => setDetailId(null)} />
          )}
          {inviteOpen && <CreateStaffModal onClose={() => setInviteOpen(false)} />}
        </div>
    </OwnerShell>
  );
}

// ---- Stat cards ------------------------------------------------------------

function StatCards({ counts }: { counts: TeamCounts }) {
  const t = useT();
  const cards: { label: string; value: number; tone: string }[] = [
    { label: t("biz.staff.count.total"), value: counts.total, tone: "text-ink" },
    { label: t("biz.staff.count.active"), value: counts.active, tone: "text-ok" },
    { label: t("biz.staff.count.invited"), value: counts.invited, tone: "text-amber-deep" },
    { label: t("biz.staff.count.suspended"), value: counts.suspended, tone: "text-danger" },
  ];
  return (
    <div className="mt-[18px] grid grid-cols-2 gap-3.5 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-[14px] border border-line bg-card p-4">
          <div className="text-xs text-subtle">{c.label}</div>
          <div className={cn("mt-1.5 font-display text-2xl font-extrabold", c.tone)}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

// ---- Team table ------------------------------------------------------------

function StatusPill({ status }: { status: TeamRow["status"] }) {
  const t = useT();
  return <Badge tone={STATUS_TONE[status]}>{t(`biz.staff.status.${status}`)}</Badge>;
}

function TeamTable({ rows, onManage }: { rows: TeamRow[]; onManage: (id: string) => void }) {
  const t = useT();
  return (
    <div className="mt-4 overflow-x-auto rounded-[18px] border border-line bg-card">
      <div className="min-w-[680px]">
        <div
          className={`${TABLE_COLS} border-b border-line px-[22px] py-3.5 text-[11px] font-bold uppercase tracking-[0.05em] text-subtle`}
        >
          <span>{t("biz.staff.col.member")}</span>
          <span>{t("biz.staff.col.access")}</span>
          <span>{t("biz.staff.col.status")}</span>
          <span>{t("biz.staff.col.lastActive")}</span>
          <span />
        </div>
        {rows.map((m) => (
          <div key={m.id} className={`${TABLE_COLS} border-b border-[#F4ECDF] px-[22px] py-[15px]`}>
            <div className="flex min-w-0 items-center gap-3.5">
              <InitialTile name={m.initials || m.name} image={m.avatar_url} size={42} />
              <div className="min-w-0">
                <div className="truncate text-[14.5px] font-bold text-ink">{m.name}</div>
                <div className="truncate text-xs text-subtle">
                  {roleLabel(t, m.role)} · {m.email}
                </div>
              </div>
            </div>
            <div>
              <Badge tone="brand">{m.access_label}</Badge>
            </div>
            <div>
              <StatusPill status={m.status} />
            </div>
            <div className="text-[12.5px] text-subtle">
              {m.last_active ? fmtWhen(m.last_active, true) : t("biz.staff.never")}
            </div>
            <div className="text-right">
              <button
                onClick={() => onManage(m.id)}
                className="whitespace-nowrap rounded-[10px] border border-line bg-card px-3.5 py-2 text-[12.5px] font-semibold text-ink transition hover:bg-board/40"
              >
                {t("biz.staff.manage")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Detail drawer ---------------------------------------------------------

function StaffDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  // Read the row from the already-fetched team list cache — the list is the
  // source of truth and every mutation invalidates it, so the drawer stays fresh.
  const team = useTeam();
  const member = team.data?.members.find((m) => m.id === id);
  const t = useT();

  // Drawer chrome is always rendered; if the row vanished (e.g. removed) we close.
  if (!member) {
    return (
      <DrawerShell onClose={onClose} title={t("biz.staff.drawer.title")}>
        <div className="text-[13px] text-subtle">{t("common.empty")}</div>
      </DrawerShell>
    );
  }

  return (
    <DrawerShell onClose={onClose} title={t("biz.staff.drawer.title")}>
      {member.kind === "invite" ? (
        <InviteDetail member={member} onClose={onClose} />
      ) : (
        <MemberDetail member={member} onClose={onClose} />
      )}
    </DrawerShell>
  );
}

function DrawerShell({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-40 flex justify-end bg-ink/35"
      role="dialog"
      aria-modal
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="h-full w-[440px] max-w-full animate-[jqSlide_.26s_ease] overflow-y-auto bg-[#FBF7F0] shadow-[-18px_0_40px_-18px_rgba(46,36,29,.4)]"
      >
        <div className="sticky top-0 z-[2] flex items-center justify-between border-b border-line bg-card px-6 py-5">
          <div className="font-display text-[17px] font-bold text-ink">{title}</div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-board/60 text-base text-subtle"
          >
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function MemberHeader({ member }: { member: TeamRow }) {
  const t = useT();
  return (
    <div className="flex items-center gap-4">
      <InitialTile name={member.initials || member.name} image={member.avatar_url} size={52} />
      <div className="min-w-0">
        <div className="font-display text-[19px] font-bold text-ink">{member.name}</div>
        <div className="mt-0.5 text-[13px] text-subtle">{roleLabel(t, member.role)}</div>
      </div>
      <span className="ml-auto">
        <StatusPill status={member.status} />
      </span>
    </div>
  );
}

function ContactRows({ member }: { member: TeamRow }) {
  const t = useT();
  const rows: [string, string][] = [
    [t("biz.staff.drawer.email"), member.email || t("biz.staff.never")],
    [t("biz.staff.drawer.phone"), member.phone || t("biz.staff.never")],
    [t("biz.staff.drawer.joined"), fmtWhen(member.joined)],
  ];
  return (
    <div className="mt-5 rounded-[14px] border border-line bg-card px-4">
      {rows.map(([k, v], i) => (
        <div
          key={k}
          className={cn(
            "flex justify-between py-[11px] text-[13px]",
            i < rows.length - 1 && "border-b border-[#F4ECDF]",
          )}
        >
          <span className="text-subtle">{k}</span>
          <span className="font-semibold text-ink">{v}</span>
        </div>
      ))}
    </div>
  );
}

function MemberDetail({ member, onClose }: { member: TeamRow; onClose: () => void }) {
  const t = useT();
  const errMessage = useErrMessage();
  const updateRole = useUpdateStaffRole();
  const suspend = useSuspendStaff();
  const reactivate = useReactivateStaff();
  const reset = useResetStaffPassword();
  const remove = useRemoveStaffMember();
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  const stats: [string, number][] = [
    [t("biz.staff.stat.scans"), member.stats.scans],
    [t("biz.staff.stat.redemptions"), member.stats.redemptions],
    [t("biz.staff.stat.signups"), member.stats.signups],
  ];
  const roleChoices: { role: TeamRole; label: string }[] = [
    { role: "cashier", label: t("biz.staff.access.cashier") },
    { role: "manager", label: t("biz.staff.access.manager") },
  ];
  const suspended = member.status === "suspended";
  const busy =
    updateRole.isPending || suspend.isPending || reactivate.isPending || remove.isPending;
  const anyError =
    updateRole.error ?? suspend.error ?? reactivate.error ?? reset.error ?? remove.error;

  return (
    <>
      <AlertDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={t("biz.staff.removeConfirm")}
        confirmLabel={t("biz.staff.remove")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          setRemoveOpen(false);
          remove.mutate(member.id, { onSuccess: onClose });
        }}
        destructive
        pending={remove.isPending}
      />
      <MemberHeader member={member} />
      <ContactRows member={member} />

      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-card px-4 py-3">
            <div className="text-[11.5px] text-subtle">{k}</div>
            <div className="mt-1 font-display text-xl font-extrabold text-ink">{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 text-xs font-bold uppercase tracking-[0.05em] text-subtle">
        {t("biz.staff.access.title")}
      </div>
      <div className="mt-2.5 flex gap-2">
        {roleChoices.map((c) => {
          const selected = member.role === c.role;
          return (
            <button
              key={c.role}
              disabled={busy || selected}
              onClick={() => updateRole.mutate({ id: member.id, role: c.role })}
              className={cn(
                "rounded-xl border-[1.5px] px-3.5 py-2.5 text-[13px] font-semibold transition disabled:opacity-60",
                selected
                  ? "border-brand bg-brand-muted text-brand-deep"
                  : "border-line bg-card text-ink hover:bg-board/40",
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-subtle">{t("biz.staff.access.hint")}</p>

      <div className="mt-6 text-xs font-bold uppercase tracking-[0.05em] text-subtle">
        {t("biz.staff.pw.title")}
      </div>
      <button
        disabled={reset.isPending}
        onClick={() =>
          reset.mutate(member.id, { onSuccess: (r) => setTempPassword(r.temp_password) })
        }
        className="mt-2.5 w-full rounded-xl border border-line bg-card py-3 text-[13px] font-semibold text-ink transition hover:bg-board/40 disabled:opacity-60"
      >
        {reset.isPending ? t("biz.staff.pw.resetting") : t("biz.staff.pw.reset")}
      </button>
      {tempPassword && (
        <div className="mt-2.5 rounded-xl bg-amber/15 px-4 py-3.5">
          <div className="text-xs text-amber-deep">{t("biz.staff.pw.note")}</div>
          <div className="mt-1.5 font-mono text-lg font-extrabold tracking-[0.04em] text-amber-deep">
            {tempPassword}
          </div>
        </div>
      )}

      {anyError && (
        <p className="mt-3 text-[12.5px] font-semibold text-danger">{errMessage(anyError)}</p>
      )}

      <div className="mt-6 flex gap-2.5">
        <button
          disabled={busy}
          onClick={() =>
            suspended
              ? reactivate.mutate(member.id)
              : suspend.mutate(member.id)
          }
          className="flex-1 rounded-xl border-[1.5px] border-line bg-card py-3 text-[13px] font-semibold text-ink transition hover:bg-board/40 disabled:opacity-60"
        >
          {suspended ? t("biz.staff.reactivate") : t("biz.staff.suspend")}
        </button>
        <button
          disabled={busy}
          onClick={() => setRemoveOpen(true)}
          className="flex-none rounded-xl border-[1.5px] border-[#E4B8AC] bg-card px-4 py-3 text-[13px] font-semibold text-danger transition hover:bg-brand-muted disabled:opacity-60"
        >
          {t("biz.staff.remove")}
        </button>
      </div>
    </>
  );
}

function InviteDetail({ member, onClose }: { member: TeamRow; onClose: () => void }) {
  const t = useT();
  const errMessage = useErrMessage();
  const cancel = useRemoveStaffInvite();
  const [cancelOpen, setCancelOpen] = useState(false);

  return (
    <>
      <AlertDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t("biz.staff.cancelInviteConfirm")}
        confirmLabel={t("biz.staff.cancelInvite")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          setCancelOpen(false);
          cancel.mutate(member.id, { onSuccess: onClose });
        }}
        destructive
        pending={cancel.isPending}
      />
      <MemberHeader member={member} />
      <ContactRows member={member} />
      {cancel.isError && (
        <p className="mt-3 text-[12.5px] font-semibold text-danger">{errMessage(cancel.error)}</p>
      )}
      <button
        disabled={cancel.isPending}
        onClick={() => setCancelOpen(true)}
        className="mt-6 w-full rounded-xl border-[1.5px] border-[#E4B8AC] bg-card py-3 text-[13px] font-semibold text-danger transition hover:bg-brand-muted disabled:opacity-60"
      >
        {t("biz.staff.cancelInvite")}
      </button>
    </>
  );
}

// ---- Create staff modal ----------------------------------------------------

function CreateStaffModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const errMessage = useErrMessage();
  const create = useCreateStaffAccount();
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<TeamRole>("cashier");
  const [pwResult, setPwResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const FIELD =
    "mt-1.5 w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-sm font-semibold text-ink outline-none transition focus:border-brand";
  const LABEL = "text-xs font-bold text-subtle";

  function onSubmit() {
    create.mutate(
      { phone: phone.trim(), role },
      { onSuccess: (r) => setPwResult(r.temp_password) },
    );
  }

  function handleClose() {
    setPwResult(null);
    setCopied(false);
    onClose();
  }

  function copyPassword() {
    if (!pwResult) return;
    void navigator.clipboard.writeText(pwResult).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
      role="dialog"
      aria-modal
      aria-labelledby="create-staff-title"
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[18px] border border-line bg-card p-5"
      >
        {pwResult ? (
          // One-time password reveal panel
          <>
            <h3 id="create-staff-title" className="font-display text-[16px] font-bold text-ink">
              {t("staff.create.passwordTitle")}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-subtle">
              {t("staff.create.passwordHelp")}
            </p>
            <div className="mt-4 rounded-xl bg-amber/15 px-4 py-4">
              <div className="font-mono text-xl font-extrabold tracking-[0.04em] text-amber-deep">
                {pwResult}
              </div>
            </div>
            <button
              onClick={copyPassword}
              className="mt-3 w-full rounded-xl border border-line bg-card py-3 text-[13px] font-semibold text-ink transition hover:bg-board/40"
            >
              {copied ? t("common.copied") : t("staff.create.copy")}
            </button>
            <button
              onClick={handleClose}
              className="mt-2.5 w-full rounded-xl bg-brand py-3 text-sm font-bold text-brand-fg shadow-glow"
            >
              {t("staff.create.done")}
            </button>
          </>
        ) : (
          // Create form
          <>
            <h3 id="create-staff-title" className="font-display text-[16px] font-bold text-ink">
              {t("staff.create.title")}
            </h3>
            <label className="mt-4 block">
              <span className={LABEL}>{t("staff.create.phone")}</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+996 700 123456"
                className={FIELD}
              />
            </label>
            <label className="mt-3 block">
              <span className={LABEL}>{t("staff.create.role")}</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as TeamRole)}
                className={FIELD}
              >
                <option value="cashier">{t("biz.staff.role.cashier")}</option>
                <option value="manager">{t("biz.staff.role.manager")}</option>
              </select>
            </label>
            {create.isError && (
              <p className="mt-3 text-[12.5px] font-semibold text-danger">{errMessage(create.error)}</p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                onClick={handleClose}
                className="rounded-xl border-[1.5px] border-line bg-card px-4 py-3 text-sm font-semibold text-ink"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={onSubmit}
                disabled={!phone.trim() || create.isPending}
                className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-brand-fg shadow-glow disabled:opacity-60"
              >
                {create.isPending ? t("staff.create.submitting") : t("staff.create.submit")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
