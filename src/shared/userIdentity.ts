/**
 * The one rule for how a signed-in user is named in every sidebar and menu:
 * profile full name -> auth metadata name -> email prefix. Never the username
 * handle, so the badge cannot flip between routes.
 */
export interface IdentityInput {
  fullName?: string | null;
  name?: string | null;
  email?: string | null;
}

const clean = (v?: string | null): string => (typeof v === "string" ? v.trim() : "");

export function resolveDisplayName({ fullName, name, email }: IdentityInput): string | null {
  const picked = clean(fullName) || clean(name) || clean(email).split("@")[0];
  return picked || null;
}
