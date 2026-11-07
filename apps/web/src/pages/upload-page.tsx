import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { BackButton } from "../components/back-button";
import { CheckIcon } from "../components/icons";
import { Button, Card, Input, Label, ProgressBar, Textarea } from "../components/ui";
import { useUploadVideo } from "../queries/videos";

interface UploadSuccessProps {
  readonly videoId: string;
  readonly title: string;
  readonly onUploadAnother: () => void;
}

function UploadSuccess({ videoId, title, onUploadAnother }: UploadSuccessProps) {
  return (
    <Card
      role="status"
      className="flex flex-col items-center gap-4 border-success/40 bg-success/10 py-10 text-center"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-success text-white">
        <CheckIcon className="size-8" />
      </span>
      <div>
        <h1 className="text-2xl font-semibold">Upload complete</h1>
        <p className="mt-1 text-muted-foreground">
          <span className="font-medium text-foreground">{title}</span> is now in your library.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          to={`/watch/${videoId}`}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Watch video
        </Link>
        <Button variant="outline" onClick={onUploadAnother}>
          Upload another
        </Button>
        <Link
          to="/"
          className="inline-flex items-center rounded-md px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          All videos
        </Link>
      </div>
    </Card>
  );
}

export function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const upload = useUploadVideo();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      return;
    }
    upload.mutate({
      file,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
    });
  };

  const startOver = () => {
    upload.reset();
    setFile(null);
    setTitle("");
    setDescription("");
  };

  return (
    <section aria-label="Upload" className="mx-auto max-w-xl">
      <BackButton />
      {upload.isSuccess ? (
        <UploadSuccess
          videoId={upload.data.videoId}
          title={upload.data.title}
          onUploadAnother={startOver}
        />
      ) : (
        <>
          <h1 className="mb-4 text-2xl font-semibold">Upload a video</h1>
          <Card>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="file">Video file</Label>
                <Input
                  id="file"
                  type="file"
                  accept="video/*"
                  required
                  disabled={upload.isPending}
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="title">Title (optional)</Label>
                <Input
                  id="title"
                  maxLength={200}
                  placeholder="Defaults to the file name"
                  disabled={upload.isPending}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  maxLength={2000}
                  disabled={upload.isPending}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>

              {upload.isPending && (
                <div className="flex flex-col gap-1.5">
                  <ProgressBar value={upload.percent} label="Upload progress" />
                  <p className="text-sm text-muted-foreground">Uploading... {upload.percent}%</p>
                </div>
              )}
              {upload.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {upload.error.message}
                </p>
              )}

              <Button type="submit" disabled={!file || upload.isPending}>
                {upload.isPending ? "Uploading..." : "Upload"}
              </Button>
            </form>
          </Card>
        </>
      )}
    </section>
  );
}
