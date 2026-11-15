import { z } from "zod";

// @careos/validation
// Zod schemas used for request/response validation, shared between API and frontend.
// Provides the single source of truth for all DTO shapes.

export const UuidSchema = z
  .string()
  .uuid({ message: "Invalid UUID format" });

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const ReferenceNumberSchema = z
  .string()
  .regex(/^[A-Z0-9]+-[A-Z0-9]+-\d{6}-\d{5}$/, {
    message: "Invalid CareOS reference number format",
  });

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
