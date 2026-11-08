package dev.ytclone.transcoder.application.service;

import dev.ytclone.transcoder.application.port.in.TranscodeVideo;
import dev.ytclone.transcoder.application.port.out.StoragePort;
import dev.ytclone.transcoder.application.port.out.TranscoderPort;
import dev.ytclone.transcoder.domain.Rendition;
import dev.ytclone.transcoder.domain.RenditionLadder;
import dev.ytclone.transcoder.domain.TranscodeJob;
import dev.ytclone.transcoder.domain.TranscodeResult;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

public class TranscodeService implements TranscodeVideo {

    private static final System.Logger LOG = System.getLogger(TranscodeService.class.getName());

    private final StoragePort storage;
    private final TranscoderPort transcoder;
    private final Path workRoot;
    private final String outputBucket;

    public TranscodeService(
            StoragePort storage, TranscoderPort transcoder, Path workRoot, String outputBucket) {
        this.storage = storage;
        this.transcoder = transcoder;
        this.workRoot = workRoot;
        this.outputBucket = outputBucket;
    }

    @Override
    public TranscodeResult transcode(TranscodeJob job) {
        Path workDir = createWorkDir(job);
        try {
            Path source = workDir.resolve("source");
            storage.download(job.sourceBucket(), job.sourceKey(), source);

            List<String> outputKeys = new ArrayList<>();
            for (Rendition rendition : RenditionLadder.forSourceHeight(transcoder.probeHeight(source))) {
                Path output = workDir.resolve(rendition.name() + ".mp4");
                transcoder.transcode(source, rendition, output);
                String key = job.videoId() + "/" + rendition.name() + ".mp4";
                storage.upload(outputBucket, key, output, "video/mp4");
                outputKeys.add(key);
            }
            return new TranscodeResult(job.videoId(), outputKeys);
        } finally {
            deleteQuietly(workDir);
        }
    }

    private Path createWorkDir(TranscodeJob job) {
        try {
            Files.createDirectories(workRoot);
            return Files.createTempDirectory(workRoot, job.videoId() + "-");
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot create a work directory in " + workRoot, e);
        }
    }

    private static void deleteQuietly(Path directory) {
        try (Stream<Path> paths = Files.walk(directory)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> path.toFile().delete());
        } catch (IOException e) {
            LOG.log(System.Logger.Level.WARNING, "Could not delete work directory " + directory, e);
        }
    }
}
