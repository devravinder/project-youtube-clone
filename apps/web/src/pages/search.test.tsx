import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Highlight } from "../components/highlight";
import { SearchBox } from "../components/search-box";
import { SUGGEST_DEBOUNCE_MS } from "../queries/search";
import { SearchPage } from "./search-page";

const fetchMock = vi.fn<(request: Request) => Promise<Response>>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hit = (n: number, title = `Video ${n}`) => ({
  id: id(n),
  title,
  description: `About ${title}`,
  renditions: ["720p", "360p"],
  createdAt: "2026-11-09T10:00:00.000Z",
});
const requested = () => fetchMock.mock.calls.map(([r]) => new URL(r.url));

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

const renderAt = (url: string) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[url]}>
        <SearchBox />
        <Routes>
          <Route path="/search" element={<SearchPage />} />
          <Route path="*" element={null} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Highlight", () => {
  it("marks the matching start of words, case-insensitively, never the middle", () => {
    const { container } = render(<Highlight text="Cats playing Piano, scat" query="cat pia" />);

    // "scat" contains "cat" but does not start with it.
    expect([...container.querySelectorAll("mark")].map((m) => m.textContent)).toEqual([
      "Cat",
      "Pia",
    ]);
    expect(container.textContent).toBe("Cats playing Piano, scat");
  });

  it("treats the query as text, not as a pattern or markup", () => {
    const { container } = render(<Highlight text="a+b <b>bold</b>" query="a+ <b>" />);

    expect(container.querySelector("b")).toBeNull();
    expect([...container.querySelectorAll("mark")].map((m) => m.textContent)).toEqual([
      "a+",
      "<b>",
    ]);
  });
});

describe("SearchPage", () => {
  it("shows hits with the total, highlighting the query", async () => {
    fetchMock.mockImplementation(async (r) =>
      new URL(r.url).pathname.endsWith("/suggest")
        ? json({ items: [] })
        : json({ total: 1, items: [hit(1, "Cats playing piano")] }),
    );
    renderAt("/search?q=cats");

    expect(await screen.findByText("1 video")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Cats playing piano/ }).getAttribute("href")).toBe(
      `/watch/${id(1)}`,
    );
    expect(screen.getByText("Up to 720p")).toBeTruthy();
    const url = requested().find((u) => u.pathname === "/search-api/search");
    expect(url?.searchParams.get("q")).toBe("cats");
    expect(url?.searchParams.get("limit")).toBe("12");
    expect(url?.searchParams.get("offset")).toBe("0");
  });

  it("says when nothing matches, and offers a retry when search is down", async () => {
    fetchMock.mockImplementation(async (r) =>
      new URL(r.url).pathname.endsWith("/suggest")
        ? json({ items: [] })
        : json({ total: 0, items: [] }),
    );
    const { unmount } = renderAt("/search?q=zzz");
    expect(await screen.findByText("No videos match.")).toBeTruthy();
    unmount();

    fetchMock.mockImplementation(async () =>
      json({ statusCode: 503, error: "x", message: "es down" }, 503),
    );
    renderAt("/search?q=cats");
    expect((await screen.findByRole("alert")).textContent).toContain("es down");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("asks for nothing without a query", () => {
    renderAt("/search");

    expect(screen.getByText("Type something in the search box.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("SearchBox", () => {
  const suggest = () => {
    fetchMock.mockImplementation(async (r) =>
      new URL(r.url).pathname.endsWith("/suggest")
        ? json({
            items: [
              { id: id(1), title: "Cats playing piano" },
              { id: id(2), title: "Cat facts" },
            ],
          })
        : json({ total: 0, items: [] }),
    );
  };
  const type = async (text: string) => {
    const input = screen.getByRole("combobox", { name: "Search videos" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: text } });
    return input;
  };

  it("suggests once typing pauses, not on every key", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    suggest();
    renderAt("/");
    const input = await type("c");
    fireEvent.change(input, { target: { value: "ca" } });
    fireEvent.change(input, { target: { value: "cat" } });
    await act(() => vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS));

    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Cats playing piano", "Cat facts"]);
    const calls = requested().filter((u) => u.pathname.endsWith("/suggest"));
    expect(calls.map((u) => u.searchParams.get("q"))).toEqual(["cat"]);
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });

  it("moves through suggestions with the arrow keys and opens the chosen video", async () => {
    suggest();
    renderAt("/");
    const input = await type("cat");
    await screen.findAllByRole("option");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const active = input.getAttribute("aria-activedescendant");
    expect(document.getElementById(active ?? "")?.textContent).toBe("Cats playing piano");
    expect(screen.getAllByRole("option")[0]?.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("where").textContent).toBe(`/watch/${id(1)}`);
  });

  it("goes to the results page on Enter without a highlighted suggestion", async () => {
    suggest();
    renderAt("/");
    const input = await type("  cat videos ");

    fireEvent.submit(input.closest("form")!);
    expect(screen.getByTestId("where").textContent).toBe("/search?q=cat%20videos");
  });

  it("closes the list on Escape and opens a suggestion by click", async () => {
    suggest();
    renderAt("/");
    const input = await type("cat");
    await screen.findAllByRole("option");

    // false = default prevented, so Chrome does not also clear the search input.
    expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(false);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(true);

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("option", { name: "Cat facts" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe(`/watch/${id(2)}`));
  });

  it("shows the query from the URL", () => {
    fetchMock.mockImplementation(async () => json({ total: 0, items: [] }));
    renderAt("/search?q=dogs");

    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("dogs");
  });
});
