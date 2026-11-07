import { useEffect, type ReactNode } from "react";
import { AuthProvider, hasAuthParams, useAuth } from "react-oidc-context";
import { useNavigate } from "react-router-dom";
import { userManager } from "./user-manager";

interface SigninState {
  readonly returnTo?: string;
}

export function AuthBoundary({ children }: { readonly children: ReactNode }) {
  const navigate = useNavigate();

  const onSigninCallback = (user?: { state?: unknown }) => {
    const { returnTo } = (user?.state ?? {}) as SigninState;
    navigate(returnTo ?? "/", { replace: true });
  };

  return (
    <AuthProvider userManager={userManager} onSigninCallback={onSigninCallback}>
      {children}
    </AuthProvider>
  );
}

export function RequireAuth({ children }: { readonly children: ReactNode }) {
  const auth = useAuth();
  const callbackInProgress = hasAuthParams();

  useEffect(() => {
    if (!auth.isAuthenticated && !auth.isLoading && !auth.activeNavigator && !callbackInProgress) {
      void auth.signinRedirect({
        state: { returnTo: window.location.pathname + window.location.search },
      });
    }
  }, [auth, callbackInProgress]);

  if (auth.error) {
    return (
      <p role="alert" className="text-destructive">
        Sign-in failed: {auth.error.message}
      </p>
    );
  }
  if (!auth.isAuthenticated) {
    return <p className="text-muted-foreground">Redirecting to sign in...</p>;
  }
  return <>{children}</>;
}
