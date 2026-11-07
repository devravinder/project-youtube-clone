import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeftIcon } from "./icons";
import { Button } from "./ui";

interface BackButtonProps {
  readonly fallback?: string;
}

// History back when the user navigated here inside the app; otherwise go to the fallback.
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
      <ArrowLeftIcon />
      Back
    </Button>
  );
}
