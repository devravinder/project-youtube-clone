import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Input, Label, ProgressBar, Textarea } from "../components/ui";
import { createPresignedUpload, uploadToStorage } from "../services/api";

type UploadState =
  | { readonly phase: "idle" }
  | { readonly phase: "uploading"; readonly percent: number }
  | { readonly phase: "done"; readonly videoId: string }
  | { readonly phase: "error"; readonly message: string };

export function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [state, setState] = useState<UploadState>({ phase: "idle" });

  const busy = state.phase === "uploading";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      return;
    }
    if (!file.type.startsWith("video/")) {
      setState({ phase: "error", message: "Choose a video file." });
      return;
    }

    setState({ phase: "uploading", percent: 0 });
    try {
      const presign = await createPresignedUpload({
        filename: file.name,
        contentType: file.type,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
      });
      await uploadToStorage(presign.uploadUrl, file, (percent) =>
        setState({ phase: "uploading", percent }),
      );
      setState({ phase: "done", videoId: presign.videoId });
    } catch (error) {
      setState({ phase: "error", message: (error as Error).message });
    }
  };

  return (
    <section aria-labelledby="upload-heading" className="mx-auto max-w-xl">
      <h1 id="upload-heading" className="mb-4 text-2xl font-semibold">
        Upload a video
      </h1>
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="file">Video file</Label>
            <Input
              id="file"
              type="file"
              accept="video/*"
              required
              disabled={busy}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              maxLength={200}
              placeholder="Defaults to the file name"
              disabled={busy}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              maxLength={2000}
              disabled={busy}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          {state.phase === "uploading" && (
            <div className="flex flex-col gap-1.5">
              <ProgressBar value={state.percent} label="Upload progress" />
              <p className="text-sm text-muted-foreground">Uploading... {state.percent}%</p>
            </div>
          )}
          {state.phase === "error" && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
          {state.phase === "done" && (
            <p role="status" className="text-sm">
              Upload complete.{" "}
              <Link to={`/watch/${state.videoId}`} className="underline">
                Watch it
              </Link>
            </p>
          )}

          <Button type="submit" disabled={!file || busy}>
            {busy ? "Uploading..." : "Upload"}
          </Button>
        </form>
      </Card>
    </section>
  );
}
