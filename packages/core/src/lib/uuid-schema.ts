import { z } from "zod";

/**
 * UUID string schema that validates format via regex pattern only.
 * Avoids `"format": "uuid"` in JSON Schema output, which triggers
 * "unknown format" warnings from Ajv (not a standard draft-07 format).
 */
export const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Must be a valid UUID",
  );
