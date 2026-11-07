import { BadRequestException, Body, Controller, Inject, Param, Post } from "@nestjs/common";
import { z } from "zod";
import {
  presignRequestSchema,
  type ConfirmUploadResponse,
  type PresignResponse,
} from "./presign.dto.js";
import { UploadsService } from "./uploads.service.js";

@Controller("uploads")
export class UploadsController {
  constructor(@Inject(UploadsService) private readonly uploads: UploadsService) {}

  @Post(":videoId/complete")
  complete(@Param("videoId") videoId: string): Promise<ConfirmUploadResponse> {
    const parsed = z.uuid().safeParse(videoId);
    if (!parsed.success) {
      throw new BadRequestException("videoId must be a UUID");
    }
    return this.uploads.confirmUpload(parsed.data);
  }

  @Post("presign")
  presign(@Body() body: unknown): Promise<PresignResponse> {
    const parsed = presignRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.uploads.createPresignedUpload(parsed.data);
  }
}
