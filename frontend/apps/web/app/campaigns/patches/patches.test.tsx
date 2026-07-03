/**
 * Patches screens — behaviour tests (campaigns redesign F2).
 *
 * Tests mock @jaqyn/api hooks at the module boundary (the repo convention:
 * see campaigns/page.test.tsx). i18n returns the key via vitest.setup.ts mock.
 * framer-motion's useReducedMotion is stubbed to false (no animation).
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PatchOut, PatchesSummary } from "@jaqyn/api";

// Minimal shell stub — avoids CustomerShell's auth + router dependencies.
vi.mock("../../_components/CustomerShell", () => ({
  CustomerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../_lib/auth", () => ({ useRequireAuth: () => ({ isAuthenticated: true }) }));

// framer-motion — disable all animations in tests.
vi.mock("framer-motion", () => ({
  useReducedMotion: () => false,
}));

// next/image (used in CustomerShell deps, not in patches directly, but avoids noise).
vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) =>
    // eslint-disable-next-line @next/next/no-img-element
    require("react").createElement("img", { alt, src }),
}));

// ShareCard uses html-to-image dynamically — stub it so tests don't try real DOM capture.
vi.mock("html-to-image", () => ({
  toPng: vi.fn().mockResolvedValue("data:image/png;base64,AAA"),
}));

// ---- Fixtures -----------------------------------------------------------------

function makePatch(over: Partial<PatchOut> = {}): PatchOut {
  return {
    slug: "first",
    name: "First Stamp",
    shape: "circle",
    icon: "star",
    color: "#C25E3C",
    light: "#DE8E70",
    deep: "#A2492A",
    how: "Collected your very first stamp in the app.",
    earned: true,
    earned_at: "2024-02-12T10:00:00Z",
    progress_current: 1,
    progress_target: 1,
    ...over,
  };
}

function makeLockedPatch(over: Partial<PatchOut> = {}): PatchOut {
  return makePatch({
    slug: "explorer",
    name: "Bishkek Explorer",
    shape: "shield",
    icon: "compass",
    color: "#C25E3C",
    light: "#DE8E70",
    deep: "#A2492A",
    how: "Visit 10 different shops around Bishkek.",
    earned: false,
    earned_at: null,
    progress_current: 8,
    progress_target: 10,
    ...over,
  });
}

const emptyPatches: PatchesSummary = {
  earned_count: 0,
  total: 15,
  board_seen: true,
  next: null,
  unseen_earned: [],
  patches: [],
};

// ---- Mock state + @jaqyn/api --------------------------------------------------

const mockMutate = vi.fn();
const mockState = {
  patches: emptyPatches as PatchesSummary,
  isLoading: false,
  isError: false,
};

vi.mock("@jaqyn/api", () => ({
  usePatches: () => ({
    data: mockState.patches,
    isLoading: mockState.isLoading,
    isError: mockState.isError,
  }),
  useMarkPatchBoardSeen: () => ({ mutate: mockMutate }),
  useMarkPatchesSeen: () => ({ mutate: mockMutate }),
}));

import PatchesPage from "./page";

describe("PatchesPage — board", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.isLoading = false;
    mockState.isError = false;
    mockState.patches = {
      ...emptyPatches,
      board_seen: true,
      patches: [makePatch(), makeLockedPatch()],
      earned_count: 1,
      total: 2,
    };
  });

  it("renders patch grid with accessible button names", () => {
    render(<PatchesPage />);
    // i18n returns key; patch.def.first.name is the key → fallback to backend name "First Stamp".
    // But since i18n mock returns key as-is: t("patch.def.first.name") === "patch.def.first.name"
    // which !== the key... wait, the mock returns the key string.
    // Our usePatchName checks: if (v === key) return backendName; so it always returns backendName.
    expect(screen.getByRole("button", { name: "First Stamp" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bishkek Explorer" })).toBeInTheDocument();
  });

  it("opens the detail sheet when a patch button is tapped", async () => {
    render(<PatchesPage />);
    const btn = screen.getByRole("button", { name: "First Stamp" });
    await userEvent.click(btn);
    // Sheet opens — the patch name appears as heading inside the sheet.
    expect(screen.getAllByText("First Stamp").length).toBeGreaterThan(1);
  });

  it("shows progress bar for locked patch in the sheet", async () => {
    render(<PatchesPage />);
    await userEvent.click(screen.getByRole("button", { name: "Bishkek Explorer" }));
    // The locked sheet shows "how to earn" key (i18n returns key in tests).
    expect(screen.getByText("patch.sheet.locked.howTo")).toBeInTheDocument();
    // Progress string — i18n returns key, so it shows the key text.
    expect(screen.getByText("patch.sheet.locked.progress")).toBeInTheDocument();
  });

  it("shows 'See campaigns' link for locked patches", async () => {
    render(<PatchesPage />);
    await userEvent.click(screen.getByRole("button", { name: "Bishkek Explorer" }));
    expect(screen.getByRole("link", { name: "patch.locked.cta" })).toBeInTheDocument();
  });

  it("shows Share + Close buttons for earned patches", async () => {
    render(<PatchesPage />);
    await userEvent.click(screen.getByRole("button", { name: "First Stamp" }));
    expect(screen.getByRole("button", { name: "patch.share" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "patch.sheet.earned.close" })).toBeInTheDocument();
  });

  it("fires board-seen mutation on mount when board_seen is false", () => {
    mockState.patches = { ...mockState.patches, board_seen: false };
    render(<PatchesPage />);
    expect(mockMutate).toHaveBeenCalled();
  });

  it("does NOT fire board-seen mutation when board_seen is already true", () => {
    mockState.patches = { ...mockState.patches, board_seen: true };
    render(<PatchesPage />);
    expect(mockMutate).not.toHaveBeenCalled();
  });
});

describe("PatchesPage — earn moment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.isLoading = false;
    mockState.isError = false;
  });

  it("shows earn-moment overlay when unseen_earned is non-empty", () => {
    const unseen = makePatch({ slug: "early", name: "Early Bird" });
    mockState.patches = {
      ...emptyPatches,
      board_seen: true,
      patches: [],
      unseen_earned: [unseen],
    };
    render(<PatchesPage />);
    // Earn moment renders patch name and CTA keys.
    expect(screen.getByText("Early Bird")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "patch.earn.keep" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "patch.earn.share" })).toBeInTheDocument();
  });

  it("calls markSeen and advances queue when 'Keep exploring' is clicked", async () => {
    const unseen = makePatch({ slug: "early", name: "Early Bird" });
    mockState.patches = {
      ...emptyPatches,
      board_seen: true,
      patches: [],
      unseen_earned: [unseen],
    };
    render(<PatchesPage />);
    await userEvent.click(screen.getByRole("button", { name: "patch.earn.keep" }));
    expect(mockMutate).toHaveBeenCalledWith(["early"]);
    // Overlay should be gone after dismiss.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "patch.earn.keep" })).not.toBeInTheDocument();
    });
  });

  it("calls markSeen and opens share card when 'Share it' is clicked", async () => {
    const unseen = makePatch({ slug: "early", name: "Early Bird" });
    mockState.patches = {
      ...emptyPatches,
      board_seen: true,
      patches: [],
      unseen_earned: [unseen],
    };
    render(<PatchesPage />);
    await userEvent.click(screen.getByRole("button", { name: "patch.earn.share" }));
    expect(mockMutate).toHaveBeenCalledWith(["early"]);
    // Share card opens — shows the save button.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "patch.share.save" })).toBeInTheDocument();
    });
  });

  it("does NOT show earn-moment when unseen_earned is empty", () => {
    mockState.patches = {
      ...emptyPatches,
      board_seen: true,
      patches: [],
      unseen_earned: [],
    };
    render(<PatchesPage />);
    expect(screen.queryByRole("button", { name: "patch.earn.keep" })).not.toBeInTheDocument();
  });
});

// ---- PatchBadge unit tests ----------------------------------------------------

import { PatchBadge } from "./PatchBadge";
import { render as renderRaw } from "@testing-library/react";

describe("PatchBadge", () => {
  const colors = { light: "#DE8E70", color: "#C25E3C", deep: "#A2492A" };

  it("renders an SVG with a radial gradient for an earned patch", () => {
    const { container } = renderRaw(
      <PatchBadge shape="circle" colors={colors} icon="star" size={82} locked={false} />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(container.querySelector("radialGradient")).toBeInTheDocument();
    // Cream merrow edge stroke present.
    const path = container.querySelector("path[stroke='#F6EFE1']");
    expect(path).toBeInTheDocument();
  });

  it("renders dashed locked variant without radial gradient", () => {
    const { container } = renderRaw(
      <PatchBadge shape="shield" colors={colors} icon="compass" size={82} locked />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    // No gradient in locked variant.
    expect(container.querySelector("radialGradient")).not.toBeInTheDocument();
    // Locked outline color present.
    const path = container.querySelector("path[stroke='#CDB99C']");
    expect(path).toBeInTheDocument();
  });

  it("applies the correct size", () => {
    const { container } = renderRaw(
      <PatchBadge shape="hexagon" colors={colors} icon="layers" size={106} />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("106");
    expect(svg?.getAttribute("height")).toBe("106");
  });

  it("renders the inset stitch ring (dashed) for earned variant", () => {
    const { container } = renderRaw(
      <PatchBadge shape="banner" colors={colors} icon="star" size={82} />,
    );
    // The stitch ring is a path with strokeDasharray.
    const stitchPath = container.querySelector("path[stroke-dasharray='3 3.4']");
    expect(stitchPath).toBeInTheDocument();
  });
});
