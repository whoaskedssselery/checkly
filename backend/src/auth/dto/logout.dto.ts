import { IsOptional, IsString } from 'class-validator';

/**
 * Logout is intentionally lenient: a client whose refresh token already
 * expired should still get a clean 204 rather than a validation error.
 */
export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}