import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthBoundary, RequireAuth } from "./auth-boundary";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  activeNavigator?: string;
  error?: Error;
  signinRedirect: ReturnType<typeof vi.fn>;
}

const auth = vi.hoisted(() => ({ current: {} as AuthState }));
const hasAuthParams = vi.hoisted(() => vi.fn(() => false));

const providerProps = vi.hoisted(() => ({
  current: {} as { onSigninCallback: (user?: unknown) => void },
}));

vi.mock("react-oidc-context", () => ({
  AuthProvider: (props: { children: unknown; onSigninCallback: (user?: unknown) => void }) => {
    providerProps.current = props;
    return props.children;
  },
  useAuth: () => auth.current,
  hasAuthParams,
}));

const setAuth = (state: Partial<AuthState>) => {
  auth.current = {
    isAuthenticated: false,
    isLoading: false,
    signinRedirect: vi.fn().mockResolvedValue(undefined),
    ...state,
  };
  return auth.current;
};

const renderGuarded = () =>
  render(
    <RequireAuth>
      <p>secret upload form</p>
    </RequireAuth>,
  );

beforeEach(() => {
  hasAuthParams.mockReturnValue(false);
  window.history.pushState({}, "", "/upload?from=nav");
});

describe("RequireAuth", () => {
  it("shows the page to a signed-in user without redirecting", () => {
    const state = setAuth({ isAuthenticated: true });

    renderGuarded();

    expect(screen.getByText("secret upload form")).toBeTruthy();
    expect(state.signinRedirect).not.toHaveBeenCalled();
  });

  it("sends an anonymous visitor to sign in and remembers the page", () => {
    const state = setAuth({});

    renderGuarded();

    expect(screen.queryByText("secret upload form")).toBeNull();
    expect(screen.getByText("Redirecting to sign in...")).toBeTruthy();
    expect(state.signinRedirect).toHaveBeenCalledWith({
      state: { returnTo: "/upload?from=nav" },
    });
  });

  it.each([
    ["while the session is loading", { isLoading: true }],
    ["while a sign-in navigation is running", { activeNavigator: "signinRedirect" }],
  ])("does not redirect %s", (_name, patch) => {
    const state = setAuth(patch);

    renderGuarded();

    expect(state.signinRedirect).not.toHaveBeenCalled();
  });

  it("does not redirect while the login callback is being processed", () => {
    hasAuthParams.mockReturnValue(true);
    const state = setAuth({});

    renderGuarded();

    expect(state.signinRedirect).not.toHaveBeenCalled();
  });

  it("shows an error instead of looping when sign-in fails", () => {
    setAuth({ error: new Error("invalid_grant") });

    renderGuarded();

    expect(screen.getByRole("alert").textContent).toContain("invalid_grant");
    expect(screen.queryByText("secret upload form")).toBeNull();
  });
});

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

describe("AuthBoundary sign-in callback", () => {
  const renderBoundary = () =>
    render(
      <MemoryRouter initialEntries={["/?code=abc&state=xyz"]}>
        <AuthBoundary>
          <Where />
        </AuthBoundary>
      </MemoryRouter>,
    );

  it("returns the user to the page they were trying to reach", () => {
    renderBoundary();

    act(() => providerProps.current.onSigninCallback({ state: { returnTo: "/upload" } }));

    expect(screen.getByTestId("where").textContent).toBe("/upload");
  });

  it("falls back to the home page and drops the code and state", () => {
    renderBoundary();

    act(() => providerProps.current.onSigninCallback({}));

    expect(screen.getByTestId("where").textContent).toBe("/");
  });
});
