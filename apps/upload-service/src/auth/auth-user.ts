import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

export interface AuthUser {
  readonly id: string;
  readonly username: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
