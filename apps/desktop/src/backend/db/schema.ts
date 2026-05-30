import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type {
  BracketNode,
  EventPaymentStatus,
  PhotoBoothCapture,
  QueueEntry,
  QueueOccurrence,
  RaceMetricsSnapshot,
  RaceParticipant,
  RaceRecord,
  TournamentParticipantSeed,
  TournamentRecord,
  TournamentStage
} from "@goldsprints/shared/types";

type JsonMap = Record<string, unknown>;
type TournamentSettingsJson = JsonMap & { seeds?: TournamentParticipantSeed[] };

// This mirrors the checked-in SQL migrations so Drizzle can provide typed queries
// without replacing the repo's SQL-first migration workflow.
export const racers = sqliteTable("racers", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const identities = sqliteTable(
  "identities",
  {
    id: text("id").primaryKey(),
    racerId: text("racer_id")
      .notNull()
      .references(() => racers.id, { onDelete: "cascade" }),
    type: text("type").$type<"email" | "phone" | "anonymous">().notNull(),
    value: text("value").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => [uniqueIndex("identities_type_value_unique").on(table.type, table.value)]
);

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  includeAllRaceData: integer("include_all_race_data", { mode: "boolean" })
    .notNull()
    .default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const eventRacers = sqliteTable(
  "event_racers",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    racerId: text("racer_id")
      .notNull()
      .references(() => racers.id, { onDelete: "cascade" }),
    paymentStatus: text("payment_status").$type<EventPaymentStatus>().notNull().default("unpaid"),
    paidAt: text("paid_at"),
    paymentUpdatedAt: text("payment_updated_at"),
    paymentNote: text("payment_note"),
    paymentProviderReference: text("payment_provider_reference"),
    createdAt: text("created_at").notNull()
  },
  (table) => [uniqueIndex("event_racers_event_racer_unique").on(table.eventId, table.racerId)]
);

export const passkeyCredentials = sqliteTable("passkey_credentials", {
  id: text("id").primaryKey(),
  racerId: text("racer_id")
    .notNull()
    .references(() => racers.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull(),
  transportsJson: text("transports_json", { mode: "json" }).$type<string[]>().notNull(),
  deviceType: text("device_type").notNull(),
  backedUp: integer("backed_up", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at")
});

export const queueEntries = sqliteTable("queue_entries", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  type: text("type").$type<QueueEntry["type"]>().notNull(),
  requestedType: text("requested_type").$type<QueueEntry["requestedType"]>().notNull(),
  lockType: text("lock_type").$type<QueueEntry["lockType"]>().notNull(),
  position: integer("position").notNull(),
  racerIdsJson: text("racer_ids_json", { mode: "json" }).$type<string[]>().notNull(),
  occurrenceIdsJson: text("occurrence_ids_json", { mode: "json" }).$type<string[]>().notNull(),
  priorityScore: real("priority_score").notNull(),
  status: text("status").$type<QueueEntry["status"]>().notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const queueOccurrences = sqliteTable("queue_occurrences", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  racerId: text("racer_id")
    .notNull()
    .references(() => racers.id, { onDelete: "cascade" }),
  status: text("status").$type<QueueEntry["status"]>().notNull(),
  intent: text("intent").$type<QueueOccurrence["intent"]>().notNull(),
  lockGroupId: text("lock_group_id"),
  signupSequence: integer("signup_sequence").notNull(),
  bumpCount: integer("bump_count").notNull(),
  raceCountAtJoin: integer("race_count_at_join").notNull(),
  projectedPosition: integer("projected_position"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const races = sqliteTable("races", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  queueEntryId: text("queue_entry_id").references(() => queueEntries.id, { onDelete: "set null" }),
  tournamentId: text("tournament_id"),
  stageId: text("stage_id"),
  mode: text("mode").$type<RaceRecord["mode"]>().notNull(),
  format: text("format").$type<RaceRecord["format"]>().notNull(),
  state: text("state").$type<RaceRecord["state"]>().notNull(),
  targetDistanceMeters: real("target_distance_meters").notNull(),
  themeId: text("theme_id").notNull(),
  participantsJson: text("participants_json", { mode: "json" })
    .$type<RaceParticipant[]>()
    .notNull(),
  metricsJson: text("metrics_json", { mode: "json" }).$type<RaceMetricsSnapshot[]>().notNull(),
  winnerRacerId: text("winner_racer_id"),
  countdownStartedAt: text("countdown_started_at"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const results = sqliteTable("results", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  raceId: text("race_id")
    .notNull()
    .references(() => races.id, { onDelete: "cascade" }),
  racerId: text("racer_id")
    .notNull()
    .references(() => racers.id, { onDelete: "cascade" }),
  lane: text("lane").$type<"left" | "right" | "solo">().notNull(),
  placement: integer("placement").notNull(),
  finishTimeMs: integer("finish_time_ms"),
  distanceMeters: real("distance_meters").notNull(),
  avgSpeedKph: real("avg_speed_kph").notNull(),
  topSpeedKph: real("top_speed_kph").notNull(),
  maxWattage: real("max_wattage").notNull(),
  createdAt: text("created_at").notNull()
});

export const tournaments = sqliteTable("tournaments", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  preset: text("preset").$type<TournamentRecord["preset"]>().notNull(),
  status: text("status").$type<TournamentRecord["status"]>().notNull(),
  settingsJson: text("settings_json", { mode: "json" }).$type<TournamentSettingsJson>().notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const tournamentStages = sqliteTable("tournament_stages", {
  id: text("id").primaryKey(),
  tournamentId: text("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  kind: text("kind").$type<TournamentStage["kind"]>().notNull(),
  name: text("name").notNull(),
  stageOrder: integer("stage_order").notNull(),
  settingsJson: text("settings_json", { mode: "json" }).$type<JsonMap>().notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const bracketNodes = sqliteTable("bracket_nodes", {
  id: text("id").primaryKey(),
  tournamentId: text("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  stageId: text("stage_id")
    .notNull()
    .references(() => tournamentStages.id, { onDelete: "cascade" }),
  roundNumber: integer("round_number").notNull(),
  matchNumber: integer("match_number").notNull(),
  slotLabel: text("slot_label").notNull(),
  racerAId: text("racer_a_id"),
  racerBId: text("racer_b_id"),
  winnerRacerId: text("winner_racer_id"),
  winnerToNodeId: text("winner_to_node_id"),
  loserToNodeId: text("loser_to_node_id"),
  state: text("state").$type<BracketNode["state"]>().notNull(),
  metaJson: text("meta_json", { mode: "json" }).$type<JsonMap>().notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const groupMatches = sqliteTable("group_matches", {
  id: text("id").primaryKey(),
  tournamentId: text("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  stageId: text("stage_id")
    .notNull()
    .references(() => tournamentStages.id, { onDelete: "cascade" }),
  racerAId: text("racer_a_id").notNull(),
  racerBId: text("racer_b_id").notNull(),
  winnerRacerId: text("winner_racer_id"),
  scoreLabel: text("score_label"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const boothCaptures = sqliteTable("booth_captures", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  racerId: text("racer_id")
    .notNull()
    .references(() => racers.id, { onDelete: "cascade" }),
  boothId: text("booth_id").notNull(),
  originalUrl: text("original_url").notNull(),
  avatarUrl: text("avatar_url").notNull(),
  capturedAt: text("captured_at").$type<PhotoBoothCapture["capturedAt"]>().notNull(),
  uploadedAt: text("uploaded_at").$type<PhotoBoothCapture["uploadedAt"]>().notNull(),
  createdAt: text("created_at").notNull()
});

// Settings rows are heterogeneous JSON blobs keyed by name, so callers narrow the
// typed value after reading the specific setting they care about.
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: text("updated_at").notNull()
});
