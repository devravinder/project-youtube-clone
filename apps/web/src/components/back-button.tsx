import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "./ui";

interface BackButtonProps {
  readonly fallback?: string;
}

// Go back if navigated within the app, else use the fallback.
export function BackButton({ fallback = "/" }: BackButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const goBack = () => {
    if (location.key === "default") {
      navigate(fallback);
    } else {
      navigate(-1);
    }
  };

  return (
    <Button variant="ghost" onClick={goBack} className="-ml-3 mb-4">
      <ArrowLeft className="size-5" />
      Back
    </Button>
  );
}
