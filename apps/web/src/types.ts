import type { components } from "./api/schema";

type Schemas = components["schemas"];

export type VideoSummary = Schemas["VideoSummary"];
export type VideoPage = Schemas["VideoPage"];
export type VideoDetail = Schemas["VideoDetail"];
export type VideoStatus = VideoSummary["status"];
export type PresignRequest = Schemas["PresignRequest"];
export type PresignResponse = Schemas["PresignResponse"];
export type ConfirmUploadResponse = Schemas["ConfirmUploadResponse"];
export type MultipartInitRequest = Schemas["MultipartInitRequest"];
export type MultipartInitResponse = Schemas["MultipartInitResponse"];
export type PartUrlsResponse = Schemas["PartUrlsResponse"];
export type UploadedPartsResponse = Schemas["UploadedPartsResponse"];
