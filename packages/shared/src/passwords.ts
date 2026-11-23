/** One password rule everywhere: sign-in, first-login change, and admin resets. Null means OK. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 10) return "Use at least 10 characters";
  if (password.length > 128) return "Use at most 128 characters";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use at least one letter and one number";
  return null;
}
