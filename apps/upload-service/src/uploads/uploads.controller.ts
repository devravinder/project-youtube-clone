import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { z } from "zod";
import { CurrentUser, type AuthUser } from "../auth/auth-user.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { ApiErrorResponse, ApiJsonResponse, schemaRef } from "../openapi/decorators.js";
import {
  multipartInitRequestSchema,
  partUrlsRequestSchema,
  type MultipartInitResponse,
  type PartUrlsResponse,
  type UploadedPartsResponse,
} from "./multipart.dto.js";
import {
  presignRequestSchema,
  type ConfirmUploadResponse,
  type PresignResponse,
} from "./presign.dto.js";
import { UploadsService } from "./uploads.service.js";

const videoIdParam = { name: "videoId", schema: { type: "string", format: "uuid" } } as const;

function parseVideoId(value: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException("videoId must be a UUID");
  }
  return parsed.data;
}

@ApiTags("uploads")
@ApiBearerAuth()
@ApiErrorResponse(401, "Missing, invalid or expired bearer token")
@Controller("uploads")
@UseGuards(AuthGuard)
export class UploadsController {
  constructor(@Inject(UploadsService) private readonly uploads: UploadsService) {}

  @Post("presign")
  @ApiOperation({
    operationId: "createPresignedUpload",
    summary: "Create a pending video and a presigned upload URL",
    description: "For small files: PUT the file to `uploadUrl`, then call the complete endpoint.",
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

  @Post("multipart")
  @ApiOperation({
    operationId: "startMultipartUpload",
    summary: "Create a pending video for a multipart upload",
    description:
      "For big files: split the file into `partCount` parts of `partSize` bytes, request part URLs, " +
      "PUT each part, then call the complete endpoint. Parts can be retried and resumed.",
  })
  @ApiBody({ schema: schemaRef("MultipartInitRequest") })
  @ApiJsonResponse(201, "Upload started", "MultipartInitResponse")
  @ApiErrorResponse(400, "Request body failed validation")
  startMultipart(
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ): Promise<MultipartInitResponse> {
    const parsed = multipartInitRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.uploads.startMultipartUpload(parsed.data, user);
  }

  @Post(":videoId/parts")
  @ApiOperation({
    operationId: "createPartUrls",
    summary: "Get presigned URLs for some parts of a multipart upload",
  })
  @ApiParam(videoIdParam)
  @ApiBody({ schema: schemaRef("PartUrlsRequest") })
  @ApiJsonResponse(201, "One URL per requested part", "PartUrlsResponse")
  @ApiErrorResponse(400, "Invalid body or a part number beyond the part count")
  @ApiErrorResponse(403, "Caller is not the uploader")
  @ApiErrorResponse(404, "Video does not exist")
  @ApiErrorResponse(409, "Not an unfinished multipart upload")
  createPartUrls(
    @Param("videoId") videoId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ): Promise<PartUrlsResponse> {
    const parsed = partUrlsRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.uploads.createPartUrls(parseVideoId(videoId), parsed.data.partNumbers, user);
  }

  @Get(":videoId/parts")
  @ApiOperation({
    operationId: "listUploadedParts",
    summary: "List the parts already in storage, for resuming an upload",
  })
  @ApiParam(videoIdParam)
  @ApiJsonResponse(200, "Parts stored so far", "UploadedPartsResponse")
  @ApiErrorResponse(400, "videoId is not a UUID")
  @ApiErrorResponse(403, "Caller is not the uploader")
  @ApiErrorResponse(404, "Video does not exist")
  @ApiErrorResponse(409, "Not an unfinished multipart upload")
  listParts(
    @Param("videoId") videoId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<UploadedPartsResponse> {
    return this.uploads.listUploadedParts(parseVideoId(videoId), user);
  }

  @Post(":videoId/complete")
  @ApiOperation({
    operationId: "confirmUpload",
    summary: "Confirm that the file reached storage",
    description:
      "Marks a pending video as uploaded. For multipart uploads it first joins the parts. " +
      "Only the uploader may confirm. Idempotent.",
  })
  @ApiParam(videoIdParam)
  @ApiJsonResponse(201, "Video is now uploaded", "ConfirmUploadResponse")
  @ApiErrorResponse(400, "videoId is not a UUID")
  @ApiErrorResponse(403, "Caller is not the uploader")
  @ApiErrorResponse(404, "Video does not exist")
  @ApiErrorResponse(409, "The file, or some of its parts, has not reached storage yet")
  complete(
    @Param("videoId") videoId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ConfirmUploadResponse> {
    return this.uploads.confirmUpload(parseVideoId(videoId), user);
  }

  @Delete(":videoId")
  @HttpCode(204)
  @ApiOperation({
    operationId: "abortUpload",
    summary: "Cancel an unfinished upload and discard what was stored",
  })
  @ApiParam(videoIdParam)
  @ApiResponse({ status: 204, description: "Upload discarded" })
  @ApiErrorResponse(400, "videoId is not a UUID")
  @ApiErrorResponse(403, "Caller is not the uploader")
  @ApiErrorResponse(404, "Video does not exist")
  @ApiErrorResponse(409, "The upload is already finished")
  async abort(@Param("videoId") videoId: string, @CurrentUser() user: AuthUser): Promise<void> {
    await this.uploads.abortUpload(parseVideoId(videoId), user);
  }
}
