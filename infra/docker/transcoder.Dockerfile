# docker build -f infra/docker/transcoder.Dockerfile .   (or scripts/build-images.mjs)
FROM alpine:latest AS build
RUN apk add --no-cache openjdk21-jdk bash
ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk
WORKDIR /src
COPY apps/transcoder-service .
# Tests run in CI and pre-commit; the image only needs the jar.
RUN ./gradlew bootJar -x test --no-daemon --console=plain && \
    find build/libs -name '*.jar' ! -name '*-plain.jar' -exec cp {} /app.jar \;

# ffmpeg and ffprobe as static binaries, so the container needs no Docker to transcode.
FROM mwader/static-ffmpeg:latest AS ffmpeg

FROM alpine:latest
RUN apk add --no-cache openjdk21-jre-headless && adduser -D -u 10001 app
COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/
COPY --from=build /app.jar /app/app.jar
USER app
# Empty image name = run the binaries above, not a container per call (application.yaml).
ENV FFMPEG_DOCKER_IMAGE="" FFMPEG_PATH=/usr/local/bin/ffmpeg FFPROBE_PATH=/usr/local/bin/ffprobe \
    TRANSCODE_WORK_DIR=/tmp/yt-transcoder
EXPOSE 3002
CMD ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
