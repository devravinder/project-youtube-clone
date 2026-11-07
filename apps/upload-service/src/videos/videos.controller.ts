import { BadRequestException, Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { z } from "zod";
import { listVideosQuerySchema, type VideoDetail, type VideoPage } from "./video.dto.js";
import { VideosService } from "./videos.service.js";

@Controller("videos")
export class VideosController {
  constructor(@Inject(VideosService) private readonly videos: VideosService) {}

  @Get()
  list(@Query() query: unknown): Promise<VideoPage> {
    const parsed = listVideosQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.videos.list(parsed.data);
  }

  @Get(":id")
  get(@Param("id") id: string): Promise<VideoDetail> {
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException("id must be a UUID");
    }
    return this.videos.get(parsed.data);
  }
}
