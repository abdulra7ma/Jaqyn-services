"use client";
import { useT } from "@jaqyn/i18n";
export default function ErrorPage({ reset }: { reset: () => void }) { const t = useT(); return <button className="m-6 rounded-xl bg-brand px-4 py-3 font-semibold text-white" onClick={reset}>{t("common.retry")}</button>; }
