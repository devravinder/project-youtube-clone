import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { AuthBoundary, RequireAuth } from "./auth/auth-boundary";
import { Layout } from "./components/layout";
import { SearchPage } from "./pages/search-page";
import { UploadPage } from "./pages/upload-page";
import { VideoListPage } from "./pages/video-list-page";
import { WatchPage } from "./pages/watch-page";

function NotFoundPage() {
  return (
    <p className="text-muted-foreground">
      Page not found.{" "}
      <Link to="/" className="underline">
        Back to videos
      </Link>
    </p>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthBoundary>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<VideoListPage />} />
            <Route
              path="upload"
              element={
                <RequireAuth>
                  <UploadPage />
                </RequireAuth>
              }
            />
            <Route path="watch/:id" element={<WatchPage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthBoundary>
    </BrowserRouter>
  );
}
