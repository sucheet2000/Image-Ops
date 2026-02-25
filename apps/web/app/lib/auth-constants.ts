export const TOKEN_KEY = 'image_ops_api_token';

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
}
