import { ExecutionContext, createParamDecorator } from "@nestjs/common";

export interface AuthUserContext {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  roles: string[];
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUserContext | null => {
  const req = ctx.switchToHttp().getRequest<{ user?: AuthUserContext }>();
  return req.user ?? null;
});
