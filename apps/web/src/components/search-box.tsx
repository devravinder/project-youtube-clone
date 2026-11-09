import { Search } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useId, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSuggestions } from "../queries/search";
import { Highlight } from "./highlight";

// ARIA 1.2 combobox with a listbox popup: arrows move, Enter opens, Escape closes.
export function SearchBox() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const { data } = useSuggestions(value);
  const suggestions = value.trim() ? (data?.items ?? []) : [];
  const expanded = open && suggestions.length > 0;

  // Follow the URL, e.g. after back/forward on the results page.
  useEffect(() => setValue(params.get("q") ?? ""), [params]);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = value.trim();
    if (!q) return;
    close();
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const pick = (index: number) => {
    const suggestion = suggestions[index];
    if (!suggestion) return;
    close();
    setValue(suggestion.title);
    navigate(`/watch/${suggestion.id}`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === "Enter" && expanded && active >= 0) {
      event.preventDefault();
      pick(active);
    } else if (event.key === "Escape") {
      // First Escape only closes the list; Chrome would also clear a search input.
      if (expanded) event.preventDefault();
      close();
    }
  };

  return (
    <form role="search" onSubmit={submit} className="relative w-full max-w-sm">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search videos
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        id={`${listId}-input`}
        type="search"
        role="combobox"
        autoComplete="off"
        placeholder="Search videos"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        // Delayed so a click on a suggestion lands before the list disappears.
        onBlur={() => setTimeout(close, 150)}
        className="w-full rounded-md border border-border bg-background py-1.5 pr-3 pl-9 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Suggestions"
        hidden={!expanded}
        className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-md border border-border bg-card shadow-lg"
      >
        {suggestions.map((s, i) => (
          <li
            key={s.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(i)}
            className={`cursor-pointer truncate px-3 py-2 text-sm ${i === active ? "bg-primary/15" : "hover:bg-primary/10"}`}
          >
            <Highlight text={s.title} query={value} />
          </li>
        ))}
      </ul>
    </form>
  );
}
