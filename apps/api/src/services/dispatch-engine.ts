import { FastifyInstance } from "fastify";

export interface TechnicianCandidate {
  id: string;
  fullName: string;
  email: string;
  phone?: string | undefined;
  status: string;
  maxActiveWorkOrders: number;
  currentWorkload: number;
  avgRating: number;
  skills: string[];
  territories: string[];
  workingToday: boolean;
  onLeave: boolean;
  lastLocation?: {
    lat: number;
    lng: number;
    updatedAt: string;
  } | undefined;
}

export interface RecommendationScore {
  technicianId: string;
  fullName: string;
  totalScore: number;
  isEligible: boolean;
  scoreBreakdown: {
    skillScore: number;       // 0 - 30
    territoryScore: number;   // 0 - 25
    availabilityScore: number;// 0 - 20
    workloadScore: number;    // 0 - 15
    proximityScore: number;   // 0 - 10
  };
  reasons: string[];
}

export interface TicketDispatchContext {
  ticketId: string;
  categoryCode?: string | undefined;
  requiredSkill?: string | undefined;
  priority: "low" | "medium" | "high" | "critical";
  scheduledDate: string;
  customerSite?: {
    postalCode?: string | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
    city?: string | undefined;
  } | undefined;
}

export const APPROVED_REJECTION_REASONS = [
  "out_of_territory",
  "skill_mismatch",
  "schedule_conflict",
  "vehicle_breakdown",
  "emergency",
  "other",
] as const;

export type RejectionReason = typeof APPROVED_REJECTION_REASONS[number];

/**
 * Calculates great-circle distance between two points in km using Haversine formula
 */
export function calculateHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Computes ranked recommendations using ONLY reliable and verified data
 */
export function computeTechnicianRecommendations(
  technicians: TechnicianCandidate[],
  context: TicketDispatchContext
): RecommendationScore[] {
  const scores: RecommendationScore[] = technicians.map((tech) => {
    const reasons: string[] = [];

    // Filter hard blocks: suspended, inactive, or on leave
    if (tech.status !== "active") {
      return {
        technicianId: tech.id,
        fullName: tech.fullName,
        totalScore: 0,
        isEligible: false,
        scoreBreakdown: {
          skillScore: 0,
          territoryScore: 0,
          availabilityScore: 0,
          workloadScore: 0,
          proximityScore: 0,
        },
        reasons: [`Technician is currently ${tech.status}`],
      };
    }

    if (tech.onLeave) {
      return {
        technicianId: tech.id,
        fullName: tech.fullName,
        totalScore: 0,
        isEligible: false,
        scoreBreakdown: {
          skillScore: 0,
          territoryScore: 0,
          availabilityScore: 0,
          workloadScore: 0,
          proximityScore: 0,
        },
        reasons: ["Technician is on approved leave for this date"],
      };
    }

    // 1. Skill Match (0 - 30)
    let skillScore = 0;
    if (context.requiredSkill) {
      if (tech.skills.includes(context.requiredSkill)) {
        skillScore = 30;
        reasons.push(`Direct skill match: ${context.requiredSkill}`);
      } else {
        skillScore = 5;
        reasons.push(`Missing certified skill: ${context.requiredSkill}`);
      }
    } else {
      // General skill match by category code
      skillScore = 25;
      reasons.push("General field technician profile");
    }

    // 2. Territory Match (0 - 25)
    let territoryScore = 15; // default fallback
    if (context.customerSite?.city) {
      const territoryMatch = tech.territories.some(
        (t) => t.toLowerCase() === context.customerSite!.city!.toLowerCase()
      );
      if (territoryMatch) {
        territoryScore = 25;
        reasons.push(`Assigned territory matches ${context.customerSite.city}`);
      }
    }

    // 3. Availability (0 - 20)
    let availabilityScore = 0;
    if (tech.workingToday) {
      availabilityScore = 20;
      reasons.push("Working shift scheduled for this date");
    } else {
      availabilityScore = 5;
      reasons.push("Non-standard shift / off-day");
    }

    // 4. Workload Balance (0 - 15)
    let workloadScore = 0;
    const remainingSlots = Math.max(0, tech.maxActiveWorkOrders - tech.currentWorkload);
    if (remainingSlots <= 0) {
      workloadScore = 0;
      reasons.push(`At maximum workload capacity (${tech.currentWorkload}/${tech.maxActiveWorkOrders})`);
    } else {
      const loadRatio = remainingSlots / tech.maxActiveWorkOrders;
      workloadScore = Math.round(loadRatio * 15);
      reasons.push(`Capacity available: ${remainingSlots} open slots (${tech.currentWorkload} active)`);
    }

    // 5. Proximity (0 - 10) - uses only permitted location
    let proximityScore = 5; // neutral
    if (
      tech.lastLocation &&
      context.customerSite?.latitude &&
      context.customerSite?.longitude
    ) {
      const distKm = calculateHaversineKm(
        tech.lastLocation.lat,
        tech.lastLocation.lng,
        context.customerSite.latitude,
        context.customerSite.longitude
      );
      if (distKm <= 10) {
        proximityScore = 10;
        reasons.push(`Within 10 km (${distKm.toFixed(1)} km away)`);
      } else if (distKm <= 30) {
        proximityScore = 7;
        reasons.push(`Within 30 km (${distKm.toFixed(1)} km away)`);
      } else {
        proximityScore = 3;
        reasons.push(`Distance is ${distKm.toFixed(1)} km away`);
      }
    }

    const totalScore =
      skillScore + territoryScore + availabilityScore + workloadScore + proximityScore;

    return {
      technicianId: tech.id,
      fullName: tech.fullName,
      totalScore,
      isEligible: remainingSlots > 0 && tech.workingToday,
      scoreBreakdown: {
        skillScore,
        territoryScore,
        availabilityScore,
        workloadScore,
        proximityScore,
      },
      reasons,
    };
  });

  // Sort descending by totalScore
  return scores.sort((a, b) => b.totalScore - a.totalScore);
}
