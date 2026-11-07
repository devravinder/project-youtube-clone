import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { BackButton } from "../components/back-button";
import { ArrowRight, Check } from "lucide-react";
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
      className="flex flex-col gap-4 border-transparent bg-primary p-6 text-primary-foreground"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-primary-foreground/20">
        <Check className="size-6" />
      </span>
      <h1 className="text-3xl font-bold">Upload complete</h1>
      <p className="text-lg">
        <span className="font-semibold">{title}</span> is now in your library.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <Link
          to={`/watch/${videoId}`}
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest hover:underline"
        >
          Watch video
          <ArrowRight className="size-5" />
        </Link>
        <div className="flex gap-4 text-sm">
          <button type="button" onClick={onUploadAnother} className="underline">
            Upload another
          </button>
          <Link to="/" className="underline">
            All videos
          </Link>
        </div>
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
          <h1 className="mb-4 text-3xl font-bold text-primary">Upload a video</h1>
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
