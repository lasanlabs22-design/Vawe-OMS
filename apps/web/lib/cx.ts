/** Joins class names, skipping falsy ones. Plain module so server and client components can both use it. */
export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
