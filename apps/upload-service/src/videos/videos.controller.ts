import { BadRequestException, Controller, Get, Inject, Param } from "@nestjs/common";
import { z } from "zod";
import type { VideoDetail, VideoSummary } from "./video.dto.js";
import { VideosService } from "./videos.service.js";

@Controller("videos")
export class VideosController {
  constructor(@Inject(VideosService) private readonly videos: VideosService) {}

  @Get()
  list(): Promise<VideoSummary[]> {
    return this.videos.list();
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
