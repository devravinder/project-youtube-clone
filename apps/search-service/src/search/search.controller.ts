import { BadRequestException, Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import { ApiErrorResponse, ApiJsonResponse } from "../openapi/openapi.js";
import {
  MAX_OFFSET,
  type SearchResult,
  searchQuerySchema,
  type SuggestResult,
  suggestQuerySchema,
} from "./search.dto.js";
import { SEARCH_INDEX_PORT, type SearchIndexPort } from "./search-index.port.js";

function parse<T extends z.ZodType>(schema: T, query: unknown): z.infer<T> {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues);
  }
  return parsed.data;
}

@ApiTags("search")
@Controller("search")
export class SearchController {
  constructor(@Inject(SEARCH_INDEX_PORT) private readonly index: SearchIndexPort) {}

  @Get()
  @ApiOperation({
    operationId: "searchVideos",
    summary: "Full-text search over titles and descriptions, typo-tolerant, best match first",
  })
  @ApiQuery({ name: "q", required: true, schema: { type: "string", minLength: 1, maxLength: 200 } })
  @ApiQuery({
    name: "limit",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 50, default: 12 },
  })
  @ApiQuery({
    name: "offset",
    required: false,
    schema: { type: "integer", minimum: 0, maximum: MAX_OFFSET, default: 0 },
  })
  @ApiJsonResponse(200, "Matching videos and the total count", "SearchResult")
  @ApiErrorResponse(400, "Query parameters failed validation")
  search(@Query() query: unknown): Promise<SearchResult> {
    return this.index.search(parse(searchQuerySchema, query));
  }

  @Get("suggest")
  @ApiOperation({
    operationId: "suggestVideos",
    summary: "Autocomplete: titles whose words start with what was typed so far",
  })
  @ApiQuery({ name: "q", required: true, schema: { type: "string", minLength: 1, maxLength: 100 } })
  @ApiQuery({
    name: "limit",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 10, default: 5 },
  })
  @ApiJsonResponse(200, "Up to limit suggestions", "SuggestResult")
  @ApiErrorResponse(400, "Query parameters failed validation")
  suggest(@Query() query: unknown): Promise<SuggestResult> {
    return this.index.suggest(parse(suggestQuerySchema, query));
  }
}
