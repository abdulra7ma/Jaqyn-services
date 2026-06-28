import type { BusinessCampaign } from "@jaqyn/api";
import type { useT } from "@jaqyn/i18n";

type Translate = ReturnType<typeof useT>;

/**
 * Rule bullets for a campaign's Overview tab (design `bd.ruleList`). Reuses the
 * customer-facing `cmp.rule.*` copy so the wording matches what customers see on the
 * campaign detail screen. Built from BusinessCampaign (its own rule shape), so this
 * lives next to the business detail rather than in the customer component file.
 */
export function ruleLinesFor(t: Translate, c: BusinessCampaign): string[] {
  const r = c.rule;
  const lines: string[] = [];
  if (c.type === "group") {
    if (r.required_group_size != null)
      lines.push(t("cmp.rule.groupSize").replace("{size}", String(r.required_group_size)));
    if (r.group_checkin_window)
      lines.push(t("cmp.rule.checkin").replace("{window}", r.group_checkin_window));
  } else if (c.type === "individual") {
    if (r.required_count != null) {
      lines.push(t("cmp.rule.visits").replace("{count}", String(r.required_count)));
    }
    if (r.max_count_per_day != null)
      lines.push(t("cmp.rule.perDay").replace("{count}", String(r.max_count_per_day)));
    if (r.min_time_between) lines.push(t("cmp.rule.minGap").replace("{gap}", r.min_time_between));
  }
  if (c.active_days || c.active_hours)
    lines.push(t("cmp.rule.window").replace("{days}", c.active_days).replace("{hours}", c.active_hours));
  lines.push(t(c.repeat_policy === "repeatable" ? "cmp.rule.repeatable" : "cmp.rule.repeatOnce"));
  return lines;
}
