"use client";

import { useCreateGroup, useGroupOffer } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button } from "@jaqyn/ui";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CustomerShell } from "../../../_components/CustomerShell";
import { QueryBoundary } from "../../../_components/QueryBoundary";
import { dealEmoji, slotToIso, timeSlots } from "../../../_components/groups";
import { useErrMessage } from "../../../_lib/useErrMessage";

export default function CreateGroupPage() {
  const t = useT();
  const errMessage = useErrMessage();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const offer = useGroupOffer(id);
  const createGroup = useCreateGroup();

  const [slot, setSlot] = useState<string | null>(null);
  // name & note are collected for the friend-facing invite; not yet sent to the API.
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slot) return;
    createGroup.mutate(
      { offerId: id, visitTime: slotToIso(slot) },
      { onSuccess: (deal) => router.push(`/groups/${deal.invite_token}`) },
    );
  };

  return (
    <CustomerShell title={t("groups.createTitle")} back={`/group-offers/${id}`} showNav={false} hideChromeTitle>
      <QueryBoundary query={offer}>
        {(o) => {
          const slots = timeSlots(o.time_start, o.time_end);
          return (
            <form onSubmit={submit} className="flex flex-col gap-6 pb-24">
              <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">
                {t("groups.createTitle")}
              </h1>

              {/* offer summary */}
              <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4 shadow-card">
                <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-brand-muted text-2xl">
                  {dealEmoji(o)}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-bold text-ink">{o.business.name}</p>
                  <p className="truncate text-sm text-subtle">
                    {o.reward_description} · {o.min_group_size} {t("groups.peopleShort")}
                  </p>
                </div>
              </div>

              {/* time slots */}
              <div>
                <p className="text-sm font-semibold text-subtle">
                  {t("groups.pickTime")} · {t("groups.today")}, {t("groups.within")} {o.time_start}–{o.time_end}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  {slots.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSlot(s)}
                      className={`rounded-xl border py-3 text-sm font-semibold transition ${
                        slot === s
                          ? "border-brand bg-brand text-brand-fg"
                          : "border-line bg-card text-ink hover:border-brand"
                      }`}
                    >
                      {s} {t("groups.today")}
                    </button>
                  ))}
                </div>
              </div>

              {/* optional name */}
              <div>
                <label className="text-sm font-semibold text-subtle">
                  {t("groups.groupName")} · {t("groups.optional")}
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("groups.namePlaceholder")}
                  className="mt-2 w-full rounded-xl border border-line bg-card px-3.5 py-3 text-sm text-ink outline-none focus:border-brand"
                />
              </div>

              {/* optional note */}
              <div>
                <label className="text-sm font-semibold text-subtle">
                  {t("groups.noteToFriends")} · {t("groups.optional")}
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("groups.notePlaceholder")}
                  rows={3}
                  className="mt-2 w-full resize-none rounded-xl border border-line bg-card px-3.5 py-3 text-sm text-ink outline-none focus:border-brand"
                />
              </div>

              {createGroup.isError && (
                <p className="text-sm text-danger">{errMessage(createGroup.error)}</p>
              )}

              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-cream/95 p-4 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
                <div className="mx-auto max-w-2xl">
                  <Button type="submit" className="w-full" disabled={!slot || createGroup.isPending}>
                    {createGroup.isPending ? t("common.loading") : t("groups.createAndInvite")}
                  </Button>
                </div>
              </div>
            </form>
          );
        }}
      </QueryBoundary>
    </CustomerShell>
  );
}
