import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ApiErrorResponse, ApiJsonResponse } from "../openapi/decorators.js";
import {
  listVideosQuerySchema,
  type VideoDetail,
  type VideoPage,
  type ViewRecorded,
} from "./video.dto.js";
import { VideosService } from "./videos.service.js";
import { viewerKey, ViewsService } from "./views.service.js";

// The two request fields a view needs (Express request).
interface ViewRequest {
  readonly ip?: string;
  get(header: string): string | undefined;
}

function parseId(id: string): string {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) {
    throw new BadRequestException("id must be a UUID");
  }
  return parsed.data;
}

@ApiTags("videos")
@Controller("videos")
export class VideosController {
  constructor(
    @Inject(VideosService) private readonly videos: VideosService,
    @Inject(ViewsService) private readonly views: ViewsService,
  ) {}

  @Get()
  @ApiOperation({
    operationId: "listVideos",
    summary: "List ready-to-show videos, newest first (cursor pagination)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 50, default: 12 },
  })
  @ApiQuery({ name: "cursor", required: false, schema: { type: "string", format: "uuid" } })
  @ApiJsonResponse(200, "One page of videos", "VideoPage")
  @ApiErrorResponse(400, "Query parameters failed validation")
  list(@Query() query: unknown): Promise<VideoPage> {
    const parsed = listVideosQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.videos.list(parsed.data);
  }

  @Get(":id")
  @ApiOperation({ operationId: "getVideo", summary: "Get one video with a fresh playback URL" })
  @ApiParam({ name: "id", schema: { type: "string", format: "uuid" } })
  @ApiJsonResponse(200, "The video", "VideoDetail")
  @ApiErrorResponse(400, "id is not a UUID")
  @ApiErrorResponse(404, "Video does not exist")
  get(@Param("id") id: string): Promise<VideoDetail> {
    return this.videos.get(parseId(id));
  }

  @Post(":id/views")
  @HttpCode(202)
  @ApiOperation({
    operationId: "recordView",
    summary: "Count a view (once per viewer per 30 minutes); totals catch up within seconds",
  })
  @ApiParam({ name: "id", schema: { type: "string", format: "uuid" } })
  @ApiJsonResponse(202, "Accepted; counted is false for a repeat view", "ViewRecorded")
  @ApiErrorResponse(400, "id is not a UUID")
  @ApiErrorResponse(404, "Video does not exist or is not READY")
  async recordView(@Param("id") id: string, @Req() req: ViewRequest): Promise<ViewRecorded> {
    const viewer = viewerKey(req.ip ?? "", req.get("user-agent") ?? "");
    return { counted: await this.views.record(parseId(id), viewer) };
  }
}
