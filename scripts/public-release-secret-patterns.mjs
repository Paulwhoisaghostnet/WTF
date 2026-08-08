export const JWT_SHAPED_CREDENTIAL_PATTERN =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;

export function hasJwtShapedCredential(source) {
  return JWT_SHAPED_CREDENTIAL_PATTERN.test(source);
}
