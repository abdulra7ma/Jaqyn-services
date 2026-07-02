import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TagInput } from "./TagInput";

// Controlled harness so value actually accumulates, like real usage.
function Harness({ initial }: { initial: string[] }) {
  const [tags, setTags] = useState(initial);
  return (
    <>
      <TagInput value={tags} onChange={setTags} />
      <div data-testid="out">{tags.join("|")}</div>
    </>
  );
}

const out = () => screen.getByTestId("out").textContent;

describe("TagInput", () => {
  it("adds a tag on Enter and dedupes case-insensitively", async () => {
    render(<Harness initial={["Coffee"]} />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Brunch{Enter}");
    expect(out()).toBe("Coffee|Brunch");
    await userEvent.type(input, "coffee{Enter}"); // duplicate
    expect(out()).toBe("Coffee|Brunch");
  });

  it("removes the last tag on Backspace when the draft is empty", async () => {
    render(<Harness initial={["Coffee", "Wi-Fi"]} />);
    await userEvent.type(screen.getByRole("textbox"), "{Backspace}");
    expect(out()).toBe("Coffee");
  });

  it("splits a comma-typed list into multiple tags", async () => {
    render(<Harness initial={[]} />);
    await userEvent.type(screen.getByRole("textbox"), "a, b, c{Enter}");
    expect(out()).toBe("a|b|c");
  });
});
