import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { CurrentUser, type AuthUser } from "../auth/auth-user.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { ApiErrorResponse, ApiJsonResponse, schemaRef } from "../openapi/decorators.js";
import {
  presignRequestSchema,
  type ConfirmUploadResponse,
  type PresignResponse,
} from "./presign.dto.js";
import { UploadsService } from "./uploads.service.js";

@ApiTags("uploads")
@ApiBearerAuth()
@ApiErrorResponse(401, "Missing, invalid or expired bearer token")
@Controller("uploads")
@UseGuards(AuthGuard)
export class UploadsController {
  constructor(@Inject(UploadsService) private readonly uploads: UploadsService) {}

  @Post(":videoId/complete")
  @ApiOperation({
    operationId: "confirmUpload",
    summary: "Confirm that the file reached storage",
    description: "Marks a pending video as uploaded. Only the uploader may confirm. Idempotent.",
  })
  @ApiParam({ name: "videoId", schema: { type: "string", format: "uuid" } })
  @ApiJsonResponse(201, "Video is now uploaded", "ConfirmUploadResponse")
  @ApiErrorResponse(400, "videoId is not a UUID")
  @ApiErrorResponse(403, "Caller is not the uploader")
  @ApiErrorResponse(404, "Video does not exist")
  @ApiErrorResponse(409, "The file has not reached storage yet")
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
  @ApiOperation({
    operationId: "createPresignedUpload",
    summary: "Create a pending video and a presigned upload URL",
    description: "PUT the file to `uploadUrl`, then call the complete endpoint.",
  })
  @ApiBody({ schema: schemaRef("PresignRequest") })
  @ApiJsonResponse(201, "Video created; upload URL issued", "PresignResponse")
  @ApiErrorResponse(400, "Request body failed validation")
  presign(@Body() body: unknown, @CurrentUser() user: AuthUser): Promise<PresignResponse> {
    const parsed = presignRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.uploads.createPresignedUpload(parsed.data, user);
  }
}
