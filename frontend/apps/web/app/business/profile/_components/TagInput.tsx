"use client";

// Chip-style tag editor. Replaces the old comma-separated text field: tags show
// as removable pills; Enter or comma commits the draft, Backspace on an empty
// draft removes the last one. Dedupes case-insensitively. Value is a string[].

import { useState } from "react";
import { useT } from "@jaqyn/i18n";

// Split helper so a pasted "a, b, c" becomes three chips at once.
function parse(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const next = [...value];
    for (const tag of parse(raw)) {
      if (!next.some((existing) => existing.toLowerCase() === tag.toLowerCase())) next.push(tag);
    }
    onChange(next);
    setDraft("");
  }
  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-xl border-[1.5px] border-line bg-card p-2 transition focus-within:border-brand">
      {value.map((tag, i) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-pill bg-[#F4ECDF] py-1 pl-3 pr-2 text-[12.5px] font-semibold text-subtle">
          {tag}
          <button
            type="button"
            onClick={() => removeAt(i)}
            aria-label={`${t("owner.settings.tagRemove")}: ${tag}`}
            className="flex h-4 w-4 items-center justify-center rounded-full text-[13px] leading-none text-subtle transition hover:bg-ink/10 hover:text-ink"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            removeAt(value.length - 1);
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-sm font-semibold text-ink outline-none placeholder:font-normal placeholder:text-subtle"
      />
    </div>
  );
}
