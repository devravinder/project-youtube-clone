package dev.ytclone.transcoder.domain;

import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Written last, so its presence means every rendition was uploaded. */
public final class TranscodeManifest {

  public static final String FILE_NAME = "manifest.json";

  private static final Pattern VIDEO_ID = Pattern.compile("\"videoId\"\\s*:\\s*\"([^\"]*)\"");
  private static final Pattern RENDITIONS = Pattern.compile("\"renditions\"\\s*:\\s*\\[([^]]*)]");
  private static final Pattern STRING = Pattern.compile("\"([^\"]*)\"");

  private TranscodeManifest() {}

  public static String key(String videoId) {
    return videoId + "/" + FILE_NAME;
  }

  // Values are our own uuids and rendition names, so they never need escaping.
  public static String toJson(TranscodeResult result) {
    String keys =
        result.outputKeys().stream().map(k -> "\"" + k + "\"").collect(Collectors.joining(","));
    return "{\"videoId\":\"" + result.videoId() + "\",\"renditions\":[" + keys + "]}\n";
  }

  public static Optional<TranscodeResult> fromJson(String json) {
    Matcher id = VIDEO_ID.matcher(json);
    Matcher renditions = RENDITIONS.matcher(json);
    if (!id.find() || !renditions.find()) {
      return Optional.empty();
    }
    Matcher item = STRING.matcher(renditions.group(1));
    List<String> keys = item.results().map(m -> m.group(1)).toList();
    return Optional.of(new TranscodeResult(id.group(1), keys));
  }
}
