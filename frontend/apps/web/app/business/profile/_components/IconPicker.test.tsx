import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IconPicker } from "./IconPicker";

describe("IconPicker", () => {
  it("opens the grid and reports the picked glyph", async () => {
    const onChange = vi.fn();
    render(<IconPicker value="☕" onChange={onChange} />);

    // Grid hidden until the trigger is clicked.
    expect(screen.queryByRole("button", { name: "🍕" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "owner.profile.icon" }));
    await userEvent.click(screen.getByRole("button", { name: "🍕" }));

    expect(onChange).toHaveBeenCalledWith("🍕");
    // Grid closes after choosing.
    expect(screen.queryByRole("button", { name: "🍕" })).not.toBeInTheDocument();
  });
});
