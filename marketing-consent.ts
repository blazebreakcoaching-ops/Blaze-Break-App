export function marketingListId(value: string | undefined): number | null {
  if (!value || !/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function shouldJoinMarketingList(
  explicitOptIn: boolean,
  verifiedEmail: boolean,
  email: string | null | undefined,
): boolean {
  return explicitOptIn === true && verifiedEmail === true && !!email;
}
