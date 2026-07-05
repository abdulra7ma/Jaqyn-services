import { WALLET_CARD_ADDED_EVENT } from "@jaqyn/api";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WalletJoinAnimation } from "./WalletJoinAnimation";

describe("WalletJoinAnimation", () => {
  afterEach(() => vi.useRealTimers());

  it("shows the joined business card and removes it after the wallet flight", () => {
    vi.useFakeTimers();
    render(<WalletJoinAnimation />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(WALLET_CARD_ADDED_EVENT, {
          detail: { businessName: "Manas Coffee", logoUrl: null },
        }),
      );
    });

    expect(screen.getByText("Manas Coffee")).toBeInTheDocument();
    expect(screen.getByText("wallet.cardAdded")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1700));
    expect(screen.queryByText("Manas Coffee")).not.toBeInTheDocument();
  });
});
