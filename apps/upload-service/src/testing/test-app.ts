import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthGuard } from "../auth/auth.guard.js";
import { APP_CONFIG } from "../config/app.config.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { STORAGE_PORT } from "../storage/storage.module.js";
import { UploadsController } from "../uploads/uploads.controller.js";
import { UploadsService } from "../uploads/uploads.service.js";
import { VideosController } from "../videos/videos.controller.js";
import { VideosService } from "../videos/videos.service.js";
import { FakePrisma } from "./fake-prisma.js";
import { FakeStorage } from "./fake-storage.js";
import { alice, bob, testConfig } from "./test-data.js";

const USERS = { alice, bob } as const;
export type TestUser = keyof typeof USERS;

// Replaces the JWT guard; `x-test-user` picks the caller.
@Injectable()
class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: unknown;
    }>();
    const name = req.headers["x-test-user"] as TestUser | undefined;
    if (!name || !USERS[name]) {
      throw new UnauthorizedException("Missing bearer token");
    }
    req.user = USERS[name];
    return true;
  }
}

export interface TestApp {
  readonly app: INestApplication;
  readonly storage: FakeStorage;
  readonly prisma: FakePrisma;
  readonly http: () => ReturnType<typeof request>;
  readonly as: (user: TestUser) => {
    readonly [method in "get" | "post" | "delete"]: (url: string) => request.Test;
  };
}

// Real controllers and services over fakes.
export async function createTestApp(): Promise<TestApp> {
  const storage = new FakeStorage();
  const prisma = new FakePrisma();
  const moduleRef = await Test.createTestingModule({
    controllers: [UploadsController, VideosController],
    providers: [
      UploadsService,
      VideosService,
      { provide: STORAGE_PORT, useValue: storage },
      { provide: PrismaService, useValue: prisma },
      { provide: APP_CONFIG, useValue: testConfig },
    ],
  })
    .overrideGuard(AuthGuard)
    .useClass(HeaderAuthGuard)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();

  const http = () => request(app.getHttpServer());
  const as = (user: TestUser) => ({
    get: (url: string) => http().get(url).set("x-test-user", user),
    post: (url: string) => http().post(url).set("x-test-user", user),
    delete: (url: string) => http().delete(url).set("x-test-user", user),
  });
  return { app, storage, prisma, http, as };
}
