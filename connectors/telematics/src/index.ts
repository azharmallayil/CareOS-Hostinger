import crypto from "node:crypto";
import type {
  TelematicsConnector,
  NormalizedTelematicsEvent,
  TelematicsEventType,
} from "@careos/integration-contracts";

export class GenericWebhookTelematicsConnector implements TelematicsConnector {
  /**
   * Cryptographically verifies HMAC-SHA256 signature using timing-safe comparison.
   */
  verifyWebhookSignature(payloadRaw: string, signature: string, secret: string): boolean {
    if (!signature || !secret) return false;

    try {
      const cleanSig = signature.replace(/^sha256=/i, "").trim().toLowerCase();
      const expectedHex = crypto
        .createHmac("sha256", secret)
        .update(payloadRaw, "utf8")
        .digest("hex")
        .toLowerCase();

      if (cleanSig.length !== expectedHex.length) {
        return false;
      }

      return crypto.timingSafeEqual(
        Buffer.from(cleanSig, "hex"),
        Buffer.from(expectedHex, "hex")
      );
    } catch {
      return false;
    }
  }

  /**
   * Normalizes incoming vendor-agnostic telematics payload into CareOS canonical event.
   * Filters out high-frequency raw GPS stream pings.
   */
  normalizeEvent(raw: Record<string, unknown>): NormalizedTelematicsEvent | null {
    if (!raw || typeof raw !== "object") return null;

    // Detect device identifier
    const deviceId =
      (raw["deviceId"] as string) ||
      (raw["device_id"] as string) ||
      (raw["imei"] as string) ||
      (raw["serialNumber"] as string) ||
      (raw["sn"] as string);

    if (!deviceId) return null;

    // Reject raw GPS breadcrumb streams that contain no telemetry status or alerts
    const isRawGpsPingOnly =
      raw["type"] === "gps_ping" ||
      (raw["lat"] !== undefined &&
        raw["lng"] !== undefined &&
        !raw["event"] &&
        !raw["alert"] &&
        !raw["fault"] &&
        !raw["status"]);

    if (isRawGpsPingOnly) {
      return null;
    }

    // Determine normalized event type
    const rawType = String(
      raw["event"] || raw["type"] || raw["eventType"] || raw["alertType"] || "device:last_seen"
    ).toLowerCase();

    let eventType: TelematicsEventType = "device:last_seen";

    if (rawType.includes("online") || rawType === "connect") {
      eventType = "device:online";
    } else if (rawType.includes("offline") || rawType === "disconnect") {
      eventType = "device:offline";
    } else if (rawType.includes("camera") || rawType.includes("video_loss") || rawType.includes("cam_fault")) {
      eventType = "camera:fault";
    } else if (rawType.includes("mdvr") || rawType.includes("storage_error") || rawType.includes("disk_fault")) {
      eventType = "mdvr:fault";
    } else if (rawType.includes("dms") || rawType.includes("fatigue") || rawType.includes("distraction")) {
      eventType = "alert:dms";
    } else if (rawType.includes("adas") || rawType.includes("fcw") || rawType.includes("ldw")) {
      eventType = "alert:adas";
    } else if (rawType.includes("ivms") || rawType.includes("harsh_") || rawType.includes("overspeed")) {
      eventType = "alert:ivms";
    } else if (rawType.includes("piwas") || rawType.includes("pedestrian")) {
      eventType = "alert:piwas";
    }

    // Extract timestamp
    const rawTime =
      (raw["timestamp"] as string) ||
      (raw["time"] as string) ||
      (raw["eventTime"] as string) ||
      new Date().toISOString();

    const timestamp = !isNaN(Date.parse(rawTime)) ? new Date(rawTime).toISOString() : new Date().toISOString();

    // Extract location if present (for context, not tracking)
    let location: NormalizedTelematicsEvent["location"] = undefined;
    const lat = Number(raw["latitude"] ?? raw["lat"]);
    const lng = Number(raw["longitude"] ?? raw["lng"]);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      location = {
        latitude: lat,
        longitude: lng,
        speedKmH: Number(raw["speed"] ?? raw["speedKmH"] ?? 0),
        headingDeg: Number(raw["heading"] ?? 0),
      };
    }

    // Extract fault details if relevant
    let faultDetails: NormalizedTelematicsEvent["faultDetails"] = undefined;
    if (eventType === "camera:fault" || eventType === "mdvr:fault") {
      faultDetails = {
        channel: Number(raw["channel"] ?? raw["camChannel"] ?? 1),
        cameraName: String(raw["cameraName"] ?? `Camera ${raw["channel"] ?? 1}`),
        errorCode: String(raw["errorCode"] ?? raw["code"] ?? "ERR_SIGNAL_LOSS"),
        storageStatus: (raw["storageStatus"] as "ok" | "degraded" | "failed" | "missing") ?? "ok",
        description: String(raw["description"] ?? raw["message"] ?? "Video loss or sensor failure detected"),
      };
    }

    // Extract alert details if relevant
    let alertDetails: NormalizedTelematicsEvent["alertDetails"] = undefined;
    if (["alert:dms", "alert:adas", "alert:ivms", "alert:piwas"].includes(eventType)) {
      const category = eventType.split(":")[1] as "dms" | "adas" | "ivms" | "piwas";
      const severity = (raw["severity"] as "low" | "medium" | "high" | "critical") ?? "medium";

      alertDetails = {
        alertCategory: category,
        alertSubtype: String(raw["subtype"] || raw["alertSubtype"] || raw["name"] || category),
        severity,
        confidenceScore: Number(raw["confidence"] ?? 0.95),
        snapshotUrl: (raw["snapshotUrl"] as string) || (raw["imageUrl"] as string),
      };
    }

    return {
      eventType,
      deviceId,
      imei: (raw["imei"] as string) || deviceId,
      assetId: (raw["assetId"] as string) || undefined,
      timestamp,
      sourceEventId: (raw["id"] as string) || (raw["eventId"] as string) || undefined,
      location,
      telemetry: {
        batteryVoltage: Number(raw["batteryVoltage"] ?? raw["voltage"] ?? 12.6),
        ignitionOn: Boolean(raw["ignition"] ?? raw["acc"]),
        odometerKm: Number(raw["odometer"] ?? raw["mileage"] ?? 0),
        firmwareVersion: (raw["firmware"] as string) || (raw["fw"] as string),
      },
      faultDetails,
      alertDetails,
      rawPayload: raw,
    };
  }

  /**
   * Heartbeat filtering & deduplication.
   * Skips creating logs or processing for routine pings within debounce window.
   */
  shouldDeduplicate(
    incoming: NormalizedTelematicsEvent,
    recent?: NormalizedTelematicsEvent
  ): boolean {
    if (!recent) return false;

    // Never deduplicate faults or safety alerts
    if (incoming.faultDetails || incoming.alertDetails) {
      return false;
    }

    // If same device and routine heartbeat (last_seen / online)
    if (
      incoming.deviceId === recent.deviceId &&
      (incoming.eventType === "device:last_seen" || incoming.eventType === "device:online") &&
      recent.eventType === incoming.eventType
    ) {
      const diffMinutes =
        (new Date(incoming.timestamp).getTime() - new Date(recent.timestamp).getTime()) / (1000 * 60);

      // Debounce window: 60 minutes for identical routine heartbeats
      return diffMinutes < 60;
    }

    return false;
  }

  /**
   * Actionable logic: decides if an inbound telematics event requires raising a service ticket.
   */
  requiresTicketGeneration(event: NormalizedTelematicsEvent): {
    generateTicket: boolean;
    priority?: string;
    category?: string;
    title?: string;
  } {
    if (event.eventType === "camera:fault") {
      return {
        generateTicket: true,
        priority: "high",
        category: "repair",
        title: `Camera Fault: ${event.faultDetails?.cameraName ?? "Channel"} [${event.faultDetails?.errorCode ?? "SIGNAL_LOSS"}]`,
      };
    }

    if (event.eventType === "mdvr:fault") {
      return {
        generateTicket: true,
        priority: "critical",
        category: "repair",
        title: `MDVR Storage Failure: ${event.deviceId} [${event.faultDetails?.errorCode ?? "DISK_ERR"}]`,
      };
    }

    if (event.eventType === "alert:dms" && event.alertDetails?.severity === "critical") {
      return {
        generateTicket: true,
        priority: "high",
        category: "inspection",
        title: `DMS Safety Alert: High-risk driver fatigue detected on device ${event.deviceId}`,
      };
    }

    return { generateTicket: false };
  }
}

export function createTelematicsConnector(): TelematicsConnector {
  return new GenericWebhookTelematicsConnector();
}
