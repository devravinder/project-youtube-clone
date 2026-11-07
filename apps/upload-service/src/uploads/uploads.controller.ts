import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { CurrentUser, type AuthUser } from "../auth/auth-user.js";
import { AuthGuard } from "../auth/auth.guard.js";
import {
  presignRequestSchema,
  type ConfirmUploadResponse,
  type PresignResponse,
} from "./presign.dto.js";
import { UploadsService } from "./uploads.service.js";

@Controller("uploads")
@UseGuards(AuthGuard)
export class UploadsController {
  constructor(@Inject(UploadsService) private readonly uploads: UploadsService) {}

  @Post(":videoId/complete")
  complete(
    @Param("videoId") videoId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ConfirmUploadResponse> {
    const parsed = z.uuid().safeParse(videoId);
    if (!parsed.success) {
      throw new BadRequestException("videoId must be a UUID");
    }
    return this.uploads.confirmUpload(parsed.data, user);
  }

  @Post("presign")
  presign(@Body() body: unknown, @CurrentUser() user: AuthUser): Promise<PresignResponse> {
    const parsed = presignRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.uploads.createPresignedUpload(parsed.data, user);
  }
}
