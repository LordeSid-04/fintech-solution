import { fireEvent, render, screen } from "@testing-library/react";
import { ResponseViewer } from "./ResponseViewer";

describe("ResponseViewer", () => {
  beforeEach(() => {
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: () => {},
    });
  });

  it("shows live timer and lets users switch generated files", () => {
    render(
      <ResponseViewer
        promptText="Build a dashboard"
        streamLines={["[system] started"]}
        generatedFiles={{
          "src/app/page.tsx": "export default function Page(){return <main>One</main>;}",
          "src/app/layout.tsx": "export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}</body></html>;}",
        }}
        responseElapsedMs={3725}
        isRunning
      />
    );

    expect(screen.getByText("00:03.72")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "src/app/page.tsx" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "src/app/layout.tsx" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "src/app/layout.tsx" }));
    expect(screen.getAllByText("src/app/layout.tsx").length).toBeGreaterThan(1);
  });
});
