"use client";

import { useState } from "react";

/** Copy-to-clipboard with a transient "copied" flag. Used by the campaign group
 * flow's invite screen (the legacy group-deals helpers were removed with that
 * surface in the campaigns restructure). */
export function useCopy(): { copied: boolean; copy: (text: string) => void } {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };
  return { copied, copy };
}
