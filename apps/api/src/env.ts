const isProduction = process.env.NODE_ENV === "production";

function origin(name: string, fallback: string): string {
  const value = process.env[name] ?? (isProduction ? undefined : fallback);
  if (!value) throw new Error(`${name} is not set`);
  return new URL(value).origin;
}

export const env = {
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  /** Where the dashboard lives, e.g. https://app.vaweinterio.in */
  appOrigin: origin("APP_ORIGIN", "http://localhost:3000"),
  /** Where the ops console lives, e.g. https://ops.vaweinterio.in */
  opsOrigin: origin("OPS_ORIGIN", "http://localhost:3000"),
};
