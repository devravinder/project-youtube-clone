import { BadRequestException, Body, Controller, Inject, Post } from "@nestjs/common";
import { presignRequestSchema, type PresignResponse } from "./presign.dto.js";
import { UploadsService } from "./uploads.service.js";

@Controller("uploads")
export class UploadsController {
  constructor(@Inject(UploadsService) private readonly uploads: UploadsService) {}

  @Post("presign")
  presign(@Body() body: unknown): Promise<PresignResponse> {
    const parsed = presignRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.uploads.createPresignedUpload(parsed.data);
  }
}
