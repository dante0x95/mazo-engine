import { describe, expect, it } from "vitest";

import { envSchema } from "./env.schema.js";
describe("envSchema", () => {
  const validEnv = {
    DATABASE_URL: "postgresql://localhost:5432/test",
  };

  it("acepta un env válido y aplica defaults", () => {
    const result = envSchema.parse(validEnv);

    expect(result.PORT).toBe(3000);
    expect(result.NODE_ENV).toBe("development");
  });

  it("convierte PORT de string a number", () => {
    const result = envSchema.parse({ ...validEnv, PORT: "8080" });

    expect(result.PORT).toBe(8080);
  });

  it("rechaza DATABASE_URL inválida", () => {
    const result = envSchema.safeParse({ DATABASE_URL: "no-es-una-url" });

    expect(result.success).toBe(false);
  });

  it("rechaza NODE_ENV desconocido", () => {
    const result = envSchema.safeParse({ ...validEnv, NODE_ENV: "staging" });

    expect(result.success).toBe(false);
  });
});
