import { z } from "zod";
import {
  EVENT_PAYMENT_STATUSES,
  QUEUE_ENTRY_REQUESTED_TYPES,
  RACER_NOTIFICATION_TYPES,
  STRIPE_MIN_PAYMENT_AMOUNT_CENTS,
  SUPPORTED_TOURNAMENT_PRESETS,
  TOURNAMENT_BRACKET_LAYOUT_MODES,
  TOURNAMENT_BRACKET_SIZES
} from "./constants";
import type { TournamentBracketLayoutMode, TournamentBracketSize } from "./types";

const tournamentBracketSizeSchema = z.custom<TournamentBracketSize>(
  (value) =>
    typeof value === "number" &&
    TOURNAMENT_BRACKET_SIZES.includes(value as (typeof TOURNAMENT_BRACKET_SIZES)[number]),
  {
    message: "Choose a supported bracket size."
  }
);

const tournamentBracketLayoutSchema = z.custom<TournamentBracketLayoutMode>(
  (value) =>
    typeof value === "string" &&
    TOURNAMENT_BRACKET_LAYOUT_MODES.includes(
      value as (typeof TOURNAMENT_BRACKET_LAYOUT_MODES)[number]
    ),
  {
    message: "Choose a supported bracket layout."
  }
);

export const createRacerSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(7).max(32).optional(),
  accountlessId: z.string().trim().min(4).max(80).optional()
});

export const createEventSchema = z.object({
  name: z.string().trim().min(1).max(120)
});

export const queueSignupSchema = z.object({
  racerId: z.string().trim().min(1),
  opponentRacerId: z.string().trim().min(1).optional(),
  requestedType: z.enum(QUEUE_ENTRY_REQUESTED_TYPES).extract(["solo", "auto-match"]).optional(),
  replaceQueueEntryId: z.string().trim().min(1).optional()
});

export const racerQueueSignupSchema = z.object({
  opponentRacerId: z.string().trim().min(1).optional(),
  requestedType: z.enum(QUEUE_ENTRY_REQUESTED_TYPES).extract(["solo", "auto-match"]).optional(),
  replaceQueueEntryId: z.string().trim().min(1).optional()
});

export const passkeyEmailSchema = z.object({
  email: z.string().trim().email()
});

export const passkeyRegistrationStartSchema = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(7).max(32).optional()
});

export const passkeyChallengeSchema = z.object({
  challengeId: z.string().trim().min(1),
  response: z.unknown()
});

export const accountlessRacerSessionSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  accountlessId: z.string().trim().min(4).max(80)
});

export const updateRacerPaymentSchema = z.object({
  status: z.enum(EVENT_PAYMENT_STATUSES),
  note: z.string().trim().max(240).optional(),
  providerReference: z.string().trim().max(120).optional()
});

export const updateEventPaymentConfigSchema = z.object({
  paymentRequiredForQueue: z.boolean(),
  paymentAmountCents: z
    .number()
    .int()
    .min(STRIPE_MIN_PAYMENT_AMOUNT_CENTS)
    .max(100_000)
    .nullable()
    .optional(),
  paymentCurrency: z.string().trim().toLowerCase().length(3).optional()
});

export const projectorWindowResizeSchema = z.object({
  preset: z.enum(["720p", "1080p"])
});

export const managedSettingSaveSchema = z.object({
  // Accepts empty string so an operator can clear a managed setting back to unset.
  value: z.string().max(4096)
});

export const startTournamentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  preset: z.enum(SUPPORTED_TOURNAMENT_PRESETS),
  bracketSize: tournamentBracketSizeSchema.optional(),
  bracketLayout: tournamentBracketLayoutSchema.optional()
});

export const tournamentIdSchema = z.object({
  tournamentId: z.string().trim().min(1)
});

export const tournamentBracketMatchSchema = z.object({
  tournamentId: z.string().trim().min(1),
  nodeId: z.string().trim().min(1)
});

export const tournamentGroupMatchSchema = z.object({
  tournamentId: z.string().trim().min(1),
  matchId: z.string().trim().min(1)
});

export const tournamentRacerSchema = z.object({
  tournamentId: z.string().trim().min(1),
  racerId: z.string().trim().min(1)
});

export const adminTournamentRacerRemovalSchema = z.object({
  replacementMode: z.enum(["auto", "racer", "bye"]),
  replacementRacerId: z.string().trim().min(1).nullable().optional()
});

export const adminTournamentByeFillSchema = z.object({
  replacementRacerId: z.string().trim().min(1)
});

export const settingUpdateSchema = z.object({
  mode: z.enum(SUPPORTED_TOURNAMENT_PRESETS).optional(),
  themeId: z.string().trim().min(1).optional(),
  os2lEnabled: z.boolean().optional(),
  autoStageNextRace: z.boolean().optional(),
  includeAllRaceData: z.boolean().optional(),
  allowAccountlessRacerSignup: z.boolean().optional(),
  showPublicRacerInfoWithoutLogin: z.boolean().optional(),
  showRacerNotificationDebugList: z.boolean().optional(),
  raceDisplayLaneColorsFlipped: z.boolean().optional(),
  raceDisplayShowEventName: z.boolean().optional(),
  raceDisplayTickerMessages: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  raceDisplayTickerSpeed: z.number().finite().min(24).max(180).optional(),
  maxActiveQueueEntriesPerRacer: z.number().int().min(1).max(10).optional(),
  targetDistanceMeters: z.number().finite().positive().max(100000).optional()
});

export const removeRacerSchema = z.object({
  racerId: z.string().trim().min(1)
});

export const createPhotoBoothTokenSchema = z.object({
  racerId: z.string().trim().min(1)
});

export const resolvePhotoBoothSessionSchema = z.object({
  token: z.string().trim().min(1),
  boothId: z.string().trim().min(1).optional()
});

const photoBoothHardwareComponentSchema = z.object({
  status: z.enum(["unknown", "online", "offline", "simulated", "error"]),
  message: z.string().trim().max(240).nullable().optional(),
  updatedAt: z.string().trim().max(80).nullable().optional()
});

export const updatePhotoBoothStatusSchema = z.object({
  boothId: z.string().trim().min(1),
  status: z.enum(["idle", "online", "capturing", "syncing", "error"]),
  pendingUploadCount: z.number().int().min(0).optional(),
  lastCaptureAt: z.string().trim().max(80).nullable().optional(),
  message: z.string().trim().max(240).nullable().optional(),
  hardware: z
    .object({
      scanner: photoBoothHardwareComponentSchema.optional(),
      camera: photoBoothHardwareComponentSchema.optional(),
      lights: photoBoothHardwareComponentSchema.optional(),
      umbrella: photoBoothHardwareComponentSchema.optional(),
      hallSensor: photoBoothHardwareComponentSchema.optional()
    })
    .optional()
});

export const webPushSubscriptionSchema = z.object({
  endpoint: z.string().trim().url(),
  expirationTime: z.number().int().nullable().optional(),
  keys: z.object({
    p256dh: z.string().trim().min(1),
    auth: z.string().trim().min(1)
  })
});

export const adminNotificationSchema = z.object({
  targetType: z.enum(["event", "queued", "tournament", "selected"]),
  type: z.enum(RACER_NOTIFICATION_TYPES).optional(),
  racerIds: z.array(z.string().trim().min(1)).max(200).optional(),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(240),
  url: z.string().trim().max(240).nullable().optional()
});

export const notificationIdSchema = z.object({
  notificationId: z.string().trim().min(1)
});
