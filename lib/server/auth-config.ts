export const organizationOptions = {
  requireEmailVerificationOnInvitation: true,
  disableOrganizationDeletion: true,
} as const;

export const sensitiveSessionFreshAgeSeconds = 10 * 60;

export function isSensitiveSessionFresh(createdAt: Date, now = Date.now()) {
  const age = now - createdAt.getTime();
  return age >= 0 && age < sensitiveSessionFreshAgeSeconds * 1000;
}
