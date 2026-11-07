import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Layout } from "./components/layout";
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
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<VideoListPage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="watch/:id" element={<WatchPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
