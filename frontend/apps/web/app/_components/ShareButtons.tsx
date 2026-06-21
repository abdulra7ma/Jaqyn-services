"use client";

import { useT } from "@jaqyn/i18n";
import { Button } from "@jaqyn/ui";
import { useState } from "react";

/** Copy / WhatsApp / Telegram share (no in-app chat — TBD §16). */
export function ShareButtons({ url, text }: { url: string; text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const enc = encodeURIComponent(`${text} ${url}`);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={copy}>
        {copied ? t("common.copied") : t("common.copy")}
      </Button>
      <a href={`https://wa.me/?text=${enc}`} target="_blank" rel="noopener noreferrer">
        <Button variant="secondary">WhatsApp</Button>
      </a>
      <a href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
        <Button variant="secondary">Telegram</Button>
      </a>
    </div>
  );
}
