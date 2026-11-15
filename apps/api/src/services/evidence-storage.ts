import crypto from "crypto";

export const ALLOWED_EVIDENCE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "video/mp4",
] as const;

export const MAX_EVIDENCE_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export interface EvidenceValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateEvidenceFile(
  mimeType: string,
  fileSizeBytes: number
): EvidenceValidationResult {
  if (!ALLOWED_EVIDENCE_MIME_TYPES.includes(mimeType as any)) {
    return {
      isValid: false,
      error: `Unsupported MIME type: '${mimeType}'. Allowed types: ${ALLOWED_EVIDENCE_MIME_TYPES.join(", ")}`,
    };
  }

  if (fileSizeBytes > MAX_EVIDENCE_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `File size ${fileSizeBytes} bytes exceeds maximum allowed limit of ${MAX_EVIDENCE_FILE_SIZE_BYTES} bytes (15MB)`,
    };
  }

  if (fileSizeBytes <= 0) {
    return {
      isValid: false,
      error: "File is empty (0 bytes)",
    };
  }

  return { isValid: true };
}

/**
 * Generates a signed URL token for private Supabase Storage object access
 */
export function generateSignedStorageToken(
  storagePath: string,
  tenantId: string,
  expiresInSeconds: number = 900 // 15 minutes default
): { token: string; expiresAt: string; signedUrl: string } {
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  const secret = process.env["STORAGE_SIGNING_KEY"] || "careos-default-storage-key-secure";
  
  const payload = `${tenantId}:${storagePath}:${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  const token = Buffer.from(JSON.stringify({ tenantId, storagePath, expiresAt, signature })).toString("base64url");
  const signedUrl = `/api/v1/evidence/download/${token}`;

  return { token, expiresAt, signedUrl };
}

/**
 * Verifies a signed storage token for retrieval
 */
export function verifySignedStorageToken(
  token: string,
  expectedTenantId?: string
): { isValid: boolean; storagePath?: string; error?: string } {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parsed = JSON.parse(raw);

    if (!parsed.storagePath || !parsed.expiresAt || !parsed.signature) {
      return { isValid: false, error: "Malformed signed storage token" };
    }

    if (new Date(parsed.expiresAt).getTime() < Date.now()) {
      return { isValid: false, error: "Signed storage URL has expired" };
    }

    if (expectedTenantId && parsed.tenantId !== expectedTenantId) {
      return { isValid: false, error: "Cross-tenant token forbidden" };
    }

    const secret = process.env["STORAGE_SIGNING_KEY"] || "careos-default-storage-key-secure";
    const payload = `${parsed.tenantId}:${parsed.storagePath}:${parsed.expiresAt}`;
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(parsed.signature, "hex"),
        Buffer.from(expectedSig, "hex")
      )
    ) {
      return { isValid: false, error: "Invalid token signature" };
    }

    return { isValid: true, storagePath: parsed.storagePath };
  } catch (err: any) {
    return { isValid: false, error: err.message || "Failed to decode token" };
  }
}
