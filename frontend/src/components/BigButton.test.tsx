import { fireEvent, screen } from "@testing-library/react";
import { vi } from "vitest";
import { renderWithProviders } from "../test/renderWithProviders";
import { BigButton } from "./BigButton";

describe("BigButton", () => {
  it("renders a link with visible words and a 64px minimum height", () => {
    renderWithProviders(<BigButton to="/patient" icon="🧩" label="Play a game" />);
    const link = screen.getByRole("link", { name: "Play a game" });
    expect(link).toHaveAttribute("href", "/patient");
    expect(link.className).toContain("min-h-16");
    expect(link.className).toContain("w-full");
  });

  it("hides the icon from screen readers so the label is the accessible name", () => {
    renderWithProviders(<BigButton icon="🧩" label="Play" onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("calls onClick when pressed", () => {
    const onClick = vi.fn();
    renderWithProviders(<BigButton label="Done" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
