"use client";

import { useMyGroups } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Badge, Button, Card } from "@jaqyn/ui";
import Link from "next/link";
import { CustomerShell } from "../_components/CustomerShell";
import { QueryBoundary } from "../_components/QueryBoundary";
import { useAuth } from "../_lib/auth";

export default function MyGroupsPage() {
  const t = useT();
  const { isAuthenticated, ready } = useAuth();
  const groups = useMyGroups();

  return (
    <CustomerShell title={t("groups.myGroups")}>
      <Link href="/group-offers" className="mb-4 block">
        <Button variant="secondary" className="w-full">
          {t("groups.title")}
        </Button>
      </Link>

      {!ready ? null : !isAuthenticated ? (
        <Card>
          <p className="text-sm text-subtle">{t("auth.loginRequired")}</p>
          <Link href="/login?return=/groups" className="mt-3 block">
            <Button className="w-full">{t("auth.login")}</Button>
          </Link>
        </Card>
      ) : (
        <QueryBoundary
          query={groups}
          isEmpty={(g) => g.length === 0}
          emptyMessage={t("groups.empty")}
        >
          {(list) => (
            <div className="flex flex-col gap-3">
              {list.map((g) => (
                <Link key={g.id} href={`/groups/${g.invite_token}`} className="block">
                  <Card className="transition hover:border-brand">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-ink">{g.group_offer.title}</p>
                        <p className="text-sm text-subtle">{g.group_offer.business.name}</p>
                      </div>
                      <Badge tone={g.status === "completed" ? "ok" : "brand"}>
                        {t(`groups.status.${g.status}`)}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-subtle">
                      {t("groups.members")}: {g.members.length}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </QueryBoundary>
      )}
    </CustomerShell>
  );
}
