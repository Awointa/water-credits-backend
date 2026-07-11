import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route as requiring a valid sensor-device API key
 * (X-API-Key header) instead of a JWT.
 *
 * Use together with ApiKeyGuard.
 *
 * @example
 *   @ApiKeyAuth()
 *   @Post('readings')
 *   async ingest(@Body() dto: CreateReadingDto) { ... }
 */
export const API_KEY_AUTH = 'api_key_auth';
export const ApiKeyAuth = () => SetMetadata(API_KEY_AUTH, true);
