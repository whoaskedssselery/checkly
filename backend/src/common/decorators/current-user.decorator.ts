import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * The shape JwtStrategy.validate returns. Keep it in sync with
 * PUBLIC_USER_SELECT — it is what every authenticated handler receives.
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);