import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { and, asc, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { nanoid } from "nanoid";
import {
  DEFAULT_EVENT_NAME,
  DEFAULT_SERVER_PORT,
  DEFAULT_TARGET_DISTANCE_METERS,
  DEFAULT_TICKER_SPEED_PIXELS_PER_SECOND,
  DEFAULT_THEME_ID
} from "@goldsprints/shared/constants";
import type {
  AdminSettings,
  AppSetting,
  BracketNode,
  EventPaymentStatus,
  EventRacerPayment,
  EventRecord,
  PhotoBoothCapture,
  QueueEntry,
  QueueOccurrence,
  RaceParticipant,
  RaceRecord,
  RaceResult,
  Racer,
  RoundRobinMatch,
  TournamentBundle,
  TournamentParticipantSeed,
  TournamentRecord,
  TournamentStage
} from "@goldsprints/shared/types";
import { nowIso } from "@goldsprints/shared/utils";
import { computeRoundRobinStandings } from "../services/competition";
import { applyMigrations } from "./migrations";
import {
  boothCaptures,
  bracketNodes,
  eventRacers,
  events,
  groupMatches,
  identities,
  passkeyCredentials,
  queueEntries,
  queueOccurrences,
  racers,
  races,
  results,
  settings,
  tournamentStages,
  tournaments
} from "./schema";
import * as schema from "./schema";

type OrmDatabase = BetterSQLite3Database<typeof schema>;
type EventRow = typeof events.$inferSelect;
type IdentityRow = typeof identities.$inferSelect;
type PasskeyCredentialRow = typeof passkeyCredentials.$inferSelect;
type RacerRow = typeof racers.$inferSelect;
type QueueEntryRow = typeof queueEntries.$inferSelect;
type QueueOccurrenceRow = typeof queueOccurrences.$inferSelect;
type RaceRow = typeof races.$inferSelect;
type ResultRow = typeof results.$inferSelect;
type TournamentRow = typeof tournaments.$inferSelect;
type TournamentStageRow = typeof tournamentStages.$inferSelect;
type BracketNodeRow = typeof bracketNodes.$inferSelect;
type GroupMatchRow = typeof groupMatches.$inferSelect;
type BoothCaptureRow = typeof boothCaptures.$inferSelect;
type RacerIdentity = Racer["identities"][number];

export interface StoredPasskeyCredential {
  id: string;
  racerId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt?: string | null;
}

const CURRENT_RACE_STATES: RaceRecord["state"][] = [
  "scheduled",
  "staging",
  "countdown",
  "active",
  "interrupted"
];

const UNFINISHED_RACE_STATES: RaceRecord["state"][] = [
  "scheduled",
  "staging",
  "countdown",
  "active"
];

function getDefaultAdminSettings(): AdminSettings {
  return {
    mode: "open-time-trial",
    themeId: DEFAULT_THEME_ID,
    os2lEnabled: false,
    autoStageNextRace: false,
    includeAllRaceData: false,
    allowAccountlessRacerSignup: false,
    paymentRequiredForQueue: false,
    raceDisplayShowEventName: true,
    raceDisplayTickerMessages: ["Fiercely local racing all night"],
    raceDisplayTickerSpeed: DEFAULT_TICKER_SPEED_PIXELS_PER_SECOND,
    maxActiveQueueEntriesPerRacer: 3,
    targetDistanceMeters: DEFAULT_TARGET_DISTANCE_METERS,
    serverPort: DEFAULT_SERVER_PORT
  };
}

function encodeJson(value: unknown): string {
  return JSON.stringify(value);
}

function mapEvent(row: EventRow): EventRecord {
  return {
    id: row.id,
    name: row.name,
    includeAllRaceData: row.includeAllRaceData,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapIdentity(row: IdentityRow): RacerIdentity {
  return {
    id: row.id,
    racerId: row.racerId,
    type: row.type,
    value: row.value,
    createdAt: row.createdAt
  };
}

function mapPasskeyCredential(row: PasskeyCredentialRow): StoredPasskeyCredential {
  return {
    id: row.id,
    racerId: row.racerId,
    credentialId: row.credentialId,
    publicKey: row.publicKey,
    counter: row.counter,
    transports: row.transportsJson,
    deviceType: row.deviceType,
    backedUp: row.backedUp,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt
  };
}

function mapEventRacerPayment(
  row: Pick<
    typeof eventRacers.$inferSelect,
    "paymentStatus" | "paidAt" | "paymentUpdatedAt" | "paymentNote" | "paymentProviderReference"
  > | null
): EventRacerPayment {
  return {
    status: row?.paymentStatus ?? "unpaid",
    paidAt: row?.paidAt ?? null,
    updatedAt: row?.paymentUpdatedAt ?? null,
    note: row?.paymentNote ?? null,
    providerReference: row?.paymentProviderReference ?? null
  };
}

function mapRacer(
  row: Pick<RacerRow, "id" | "displayName" | "avatarUrl" | "createdAt" | "updatedAt">,
  racerIdentities: RacerIdentity[]
): Racer {
  return {
    id: row.id,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    identities: racerIdentities
  };
}

function mapQueueEntry(row: QueueEntryRow): QueueEntry {
  return {
    id: row.id,
    eventId: row.eventId,
    type: row.type,
    requestedType: row.requestedType,
    lockType: row.lockType,
    position: row.position,
    racerIds: row.racerIdsJson,
    occurrenceIds: row.occurrenceIdsJson,
    priorityScore: row.priorityScore,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapQueueOccurrence(row: QueueOccurrenceRow): QueueOccurrence {
  return {
    id: row.id,
    eventId: row.eventId,
    racerId: row.racerId,
    status: row.status,
    intent: row.intent,
    lockGroupId: row.lockGroupId,
    signupSequence: row.signupSequence,
    bumpCount: row.bumpCount,
    raceCountAtJoin: row.raceCountAtJoin,
    projectedPosition: row.projectedPosition,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapRace(row: RaceRow): RaceRecord {
  return {
    id: row.id,
    eventId: row.eventId,
    queueEntryId: row.queueEntryId,
    tournamentId: row.tournamentId,
    stageId: row.stageId,
    mode: row.mode,
    format: row.format,
    state: row.state,
    targetDistanceMeters: row.targetDistanceMeters,
    themeId: row.themeId,
    participants: row.participantsJson,
    metrics: row.metricsJson,
    winnerRacerId: row.winnerRacerId,
    countdownStartedAt: row.countdownStartedAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapResult(row: ResultRow): RaceResult {
  return {
    id: row.id,
    eventId: row.eventId,
    raceId: row.raceId,
    racerId: row.racerId,
    lane: row.lane,
    placement: row.placement,
    finishTimeMs: row.finishTimeMs,
    distanceMeters: row.distanceMeters,
    avgSpeedKph: row.avgSpeedKph,
    topSpeedKph: row.topSpeedKph,
    maxWattage: row.maxWattage,
    createdAt: row.createdAt
  };
}

function mapTournament(row: TournamentRow): TournamentRecord {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    preset: row.preset,
    status: row.status,
    settings: row.settingsJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapTournamentStage(row: TournamentStageRow): TournamentStage {
  return {
    id: row.id,
    tournamentId: row.tournamentId,
    kind: row.kind,
    name: row.name,
    order: row.stageOrder,
    settings: row.settingsJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapBracketNode(row: BracketNodeRow): BracketNode {
  return {
    id: row.id,
    tournamentId: row.tournamentId,
    stageId: row.stageId,
    roundNumber: row.roundNumber,
    matchNumber: row.matchNumber,
    slotLabel: row.slotLabel,
    racerAId: row.racerAId,
    racerBId: row.racerBId,
    winnerRacerId: row.winnerRacerId,
    winnerToNodeId: row.winnerToNodeId,
    loserToNodeId: row.loserToNodeId,
    state: row.state,
    meta: row.metaJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapGroupMatch(row: GroupMatchRow): RoundRobinMatch {
  return {
    id: row.id,
    racerAId: row.racerAId,
    racerBId: row.racerBId,
    winnerRacerId: row.winnerRacerId,
    scoreLabel: row.scoreLabel
  };
}

function mapBoothCapture(row: BoothCaptureRow): PhotoBoothCapture {
  return {
    id: row.id,
    eventId: row.eventId,
    racerId: row.racerId,
    boothId: row.boothId,
    originalUrl: row.originalUrl,
    avatarUrl: row.avatarUrl,
    capturedAt: row.capturedAt,
    uploadedAt: row.uploadedAt,
    createdAt: row.createdAt
  };
}

export class AppDatabase {
  private readonly db: Database.Database;
  private readonly orm: OrmDatabase;

  constructor(private readonly dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    const dbFile = path.join(dataDir, "goldsprints.sqlite");
    this.db = new Database(dbFile);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.orm = drizzle(this.db, { schema });
  }

  init(): void {
    applyMigrations(this.db);
    this.ensureAdminSettings();
    this.ensureActiveEvent();
    this.ensureQueueOccurrenceBackfill();
    this.markUnfinishedRacesInterrupted();
  }

  close(): void {
    this.db.close();
  }

  private ensureAdminSettings(): void {
    const existing = this.orm
      .select({ key: settings.key })
      .from(settings)
      .where(eq(settings.key, "adminSettings"))
      .get();
    if (existing) {
      return;
    }

    this.orm
      .insert(settings)
      .values({
        key: "adminSettings",
        valueJson: getDefaultAdminSettings(),
        updatedAt: nowIso()
      })
      .run();
  }

  private ensureActiveEvent(): EventRecord {
    const existing = this.getActiveEvent();
    if (existing) {
      return existing;
    }

    return this.createEvent(DEFAULT_EVENT_NAME);
  }

  private ensureQueueOccurrenceBackfill(): void {
    const legacyRows = this.db
      .prepare(
        "SELECT id, event_id, requested_type, position, racer_ids_json, status, created_at, updated_at FROM queue_entries WHERE occurrence_ids_json = '[]'"
      )
      .all() as {
      id: string;
      event_id: string;
      requested_type: QueueEntry["requestedType"];
      position: number;
      racer_ids_json: string;
      status: QueueEntry["status"];
      created_at: string;
      updated_at: string;
    }[];

    if (legacyRows.length === 0) {
      return;
    }

    const insertOccurrence = this.db.prepare(
      "INSERT INTO queue_occurrences (id, event_id, racer_id, status, intent, lock_group_id, signup_sequence, bump_count, race_count_at_join, projected_position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const updateEntry = this.db.prepare(
      "UPDATE queue_entries SET lock_type = ?, occurrence_ids_json = ?, priority_score = 0 WHERE id = ?"
    );
    const transaction = this.db.transaction(() => {
      for (const row of legacyRows) {
        const racerIds = JSON.parse(row.racer_ids_json) as string[];
        const lockGroupId = row.requested_type === "match" ? `legacy-lock-${row.id}` : null;
        const occurrenceIds = racerIds.map(() => nanoid());
        const intent =
          row.requested_type === "match"
            ? "challenge"
            : row.requested_type === "solo"
              ? "solo"
              : "auto-match";

        racerIds.forEach((racerId, index) => {
          insertOccurrence.run(
            occurrenceIds[index],
            row.event_id,
            racerId,
            row.status,
            intent,
            lockGroupId,
            row.position * 10 + index,
            0,
            0,
            row.position,
            row.created_at,
            row.updated_at
          );
        });

        updateEntry.run(
          row.requested_type === "match" ? "challenge" : "flex",
          encodeJson(occurrenceIds),
          row.id
        );
      }
    });
    transaction();
  }

  private markUnfinishedRacesInterrupted(): void {
    this.orm
      .update(races)
      .set({
        state: "interrupted",
        updatedAt: nowIso()
      })
      .where(inArray(races.state, UNFINISHED_RACE_STATES))
      .run();
  }

  getSetting<T>(key: string, fallback: T): AppSetting<T> {
    const row = this.orm
      .select({
        valueJson: settings.valueJson,
        updatedAt: settings.updatedAt
      })
      .from(settings)
      .where(eq(settings.key, key))
      .get();
    return {
      key,
      value: row ? (row.valueJson as T) : fallback,
      updatedAt: row?.updatedAt ?? nowIso()
    };
  }

  setSetting<T>(key: string, value: T): AppSetting<T> {
    const timestamp = nowIso();
    this.orm
      .insert(settings)
      .values({
        key,
        valueJson: value,
        updatedAt: timestamp
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          valueJson: value,
          updatedAt: timestamp
        }
      })
      .run();

    return {
      key,
      value,
      updatedAt: timestamp
    };
  }

  getAdminSettings(): AdminSettings {
    const defaultValue = getDefaultAdminSettings();
    const persistedSettings = this.getSetting<
      Partial<AdminSettings> & { allowAnonymousRacerSignup?: boolean }
    >("adminSettings", defaultValue).value;
    const legacyAccountlessToggle = persistedSettings.allowAnonymousRacerSignup;
    return {
      ...defaultValue,
      ...persistedSettings,
      allowAccountlessRacerSignup:
        persistedSettings.allowAccountlessRacerSignup ?? legacyAccountlessToggle ?? false
    };
  }

  updateAdminSettings(patch: Partial<AdminSettings>): AdminSettings {
    const next = {
      ...this.getAdminSettings(),
      ...patch
    };
    const timestamp = nowIso();

    this.orm
      .insert(settings)
      .values({
        key: "adminSettings",
        valueJson: next,
        updatedAt: timestamp
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          valueJson: next,
          updatedAt: timestamp
        }
      })
      .run();

    return next;
  }

  createEvent(name: string): EventRecord {
    const id = nanoid();
    const timestamp = nowIso();

    this.orm.transaction((tx) => {
      tx.update(events).set({ active: false, updatedAt: timestamp }).run();
      tx.insert(events)
        .values({
          id,
          name,
          includeAllRaceData: false,
          active: true,
          createdAt: timestamp,
          updatedAt: timestamp
        })
        .run();
    });

    return this.getActiveEvent()!;
  }

  getActiveEvent(): EventRecord | null {
    const row = this.orm
      .select()
      .from(events)
      .where(eq(events.active, true))
      .orderBy(desc(events.updatedAt))
      .get();

    return row ? mapEvent(row) : null;
  }

  listEvents(): EventRecord[] {
    return this.orm.select().from(events).orderBy(desc(events.createdAt)).all().map(mapEvent);
  }

  private listIdentities(racerId: string): RacerIdentity[] {
    return this.orm
      .select()
      .from(identities)
      .where(eq(identities.racerId, racerId))
      .orderBy(asc(identities.createdAt))
      .all()
      .map(mapIdentity);
  }

  findRacerByIdentity(type: "email" | "phone" | "anonymous", value: string): Racer | null {
    const row = this.orm
      .select({
        id: racers.id,
        displayName: racers.displayName,
        avatarUrl: racers.avatarUrl,
        createdAt: racers.createdAt,
        updatedAt: racers.updatedAt
      })
      .from(racers)
      .innerJoin(identities, eq(identities.racerId, racers.id))
      .where(and(eq(identities.type, type), eq(identities.value, value)))
      .get();

    return row ? mapRacer(row, this.listIdentities(row.id)) : null;
  }

  createOrUpdateRacer(input: {
    displayName: string;
    email?: string;
    phone?: string;
    accountlessId?: string;
  }): Racer {
    const existing =
      (input.email ? this.findRacerByIdentity("email", input.email) : null) ??
      (input.phone ? this.findRacerByIdentity("phone", input.phone) : null) ??
      (input.accountlessId ? this.findRacerByIdentity("anonymous", input.accountlessId) : null);

    const timestamp = nowIso();
    if (existing) {
      this.orm
        .update(racers)
        .set({
          displayName: input.displayName,
          updatedAt: timestamp
        })
        .where(eq(racers.id, existing.id))
        .run();

      this.attachIdentity(existing.id, "email", input.email);
      this.attachIdentity(existing.id, "phone", input.phone);
      // The DB identity value stays `anonymous` for migration compatibility, but the product
      // language and API now call this an accountless racer identity.
      this.attachIdentity(existing.id, "anonymous", input.accountlessId);
      return this.getRacer(existing.id)!;
    }

    const racerId = nanoid();
    this.orm
      .insert(racers)
      .values({
        id: racerId,
        displayName: input.displayName,
        avatarUrl: null,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .run();

    this.attachIdentity(racerId, "email", input.email);
    this.attachIdentity(racerId, "phone", input.phone);
    this.attachIdentity(racerId, "anonymous", input.accountlessId);
    return this.getRacer(racerId)!;
  }

  updateRacerRegistration(
    racerId: string,
    input: {
      displayName: string;
      email?: string;
      phone?: string;
    }
  ): Racer | null {
    this.orm
      .update(racers)
      .set({
        displayName: input.displayName,
        updatedAt: nowIso()
      })
      .where(eq(racers.id, racerId))
      .run();
    this.attachIdentity(racerId, "email", input.email);
    this.attachIdentity(racerId, "phone", input.phone);
    return this.getRacer(racerId);
  }

  private attachIdentity(
    racerId: string,
    type: "email" | "phone" | "anonymous",
    value?: string
  ): void {
    if (!value) {
      return;
    }

    this.orm
      .insert(identities)
      .values({
        id: nanoid(),
        racerId,
        type,
        value,
        createdAt: nowIso()
      })
      .onConflictDoNothing()
      .run();
  }

  attachRacerIdentity(
    racerId: string,
    type: "email" | "phone" | "anonymous",
    value: string
  ): Racer | null {
    this.attachIdentity(racerId, type, value);
    return this.getRacer(racerId);
  }

  listPasskeyCredentialsForRacer(racerId: string): StoredPasskeyCredential[] {
    return this.orm
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.racerId, racerId))
      .orderBy(asc(passkeyCredentials.createdAt))
      .all()
      .map(mapPasskeyCredential);
  }

  getPasskeyCredentialByCredentialId(credentialId: string): StoredPasskeyCredential | null {
    const row = this.orm
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.credentialId, credentialId))
      .get();

    return row ? mapPasskeyCredential(row) : null;
  }

  createPasskeyCredential(input: {
    racerId: string;
    credentialId: string;
    publicKey: string;
    counter: number;
    transports: string[];
    deviceType: string;
    backedUp: boolean;
  }): StoredPasskeyCredential {
    const createdAt = nowIso();
    this.orm
      .insert(passkeyCredentials)
      .values({
        id: nanoid(),
        racerId: input.racerId,
        credentialId: input.credentialId,
        publicKey: input.publicKey,
        counter: input.counter,
        transportsJson: input.transports,
        deviceType: input.deviceType,
        backedUp: input.backedUp,
        createdAt,
        lastUsedAt: null
      })
      .run();

    return this.getPasskeyCredentialByCredentialId(input.credentialId)!;
  }

  updatePasskeyCredentialUse(credentialId: string, counter: number): void {
    this.orm
      .update(passkeyCredentials)
      .set({
        counter,
        lastUsedAt: nowIso()
      })
      .where(eq(passkeyCredentials.credentialId, credentialId))
      .run();
  }

  getRacer(racerId: string): Racer | null {
    const row = this.orm.select().from(racers).where(eq(racers.id, racerId)).get();
    return row ? mapRacer(row, this.listIdentities(racerId)) : null;
  }

  updateRacerAvatar(racerId: string, avatarUrl: string): Racer | null {
    this.orm
      .update(racers)
      .set({
        avatarUrl,
        updatedAt: nowIso()
      })
      .where(eq(racers.id, racerId))
      .run();

    return this.getRacer(racerId);
  }

  createBoothCapture(input: Omit<PhotoBoothCapture, "createdAt">): PhotoBoothCapture {
    const createdAt = nowIso();
    this.orm
      .insert(boothCaptures)
      .values({
        ...input,
        createdAt
      })
      .run();

    return this.getBoothCapture(input.id)!;
  }

  getBoothCapture(captureId: string): PhotoBoothCapture | null {
    const row = this.orm.select().from(boothCaptures).where(eq(boothCaptures.id, captureId)).get();

    return row ? mapBoothCapture(row) : null;
  }

  listBoothCaptures(eventId: string, racerId?: string): PhotoBoothCapture[] {
    const rows = racerId
      ? this.orm
          .select()
          .from(boothCaptures)
          .where(and(eq(boothCaptures.eventId, eventId), eq(boothCaptures.racerId, racerId)))
          .orderBy(desc(boothCaptures.capturedAt))
          .all()
      : this.orm
          .select()
          .from(boothCaptures)
          .where(eq(boothCaptures.eventId, eventId))
          .orderBy(desc(boothCaptures.capturedAt))
          .all();

    return rows.map(mapBoothCapture);
  }

  ensureEventRegistration(eventId: string, racerId: string): void {
    this.orm
      .insert(eventRacers)
      .values({
        id: nanoid(),
        eventId,
        racerId,
        createdAt: nowIso()
      })
      .onConflictDoNothing()
      .run();
  }

  getEventRacerPayment(eventId: string, racerId: string): EventRacerPayment {
    const row = this.orm
      .select({
        paymentStatus: eventRacers.paymentStatus,
        paidAt: eventRacers.paidAt,
        paymentUpdatedAt: eventRacers.paymentUpdatedAt,
        paymentNote: eventRacers.paymentNote,
        paymentProviderReference: eventRacers.paymentProviderReference
      })
      .from(eventRacers)
      .where(and(eq(eventRacers.eventId, eventId), eq(eventRacers.racerId, racerId)))
      .get();

    return mapEventRacerPayment(row ?? null);
  }

  updateEventRacerPayment(
    eventId: string,
    racerId: string,
    input: {
      status: EventPaymentStatus;
      note?: string;
      providerReference?: string;
    }
  ): EventRacerPayment {
    this.ensureEventRegistration(eventId, racerId);
    const timestamp = nowIso();
    this.orm
      .update(eventRacers)
      .set({
        paymentStatus: input.status,
        paidAt: input.status === "paid" ? timestamp : null,
        paymentUpdatedAt: timestamp,
        paymentNote: input.note ?? null,
        paymentProviderReference: input.providerReference ?? null
      })
      .where(and(eq(eventRacers.eventId, eventId), eq(eventRacers.racerId, racerId)))
      .run();

    return this.getEventRacerPayment(eventId, racerId);
  }

  listRacers(search?: string): Racer[] {
    const baseSelection = {
      id: racers.id,
      displayName: racers.displayName,
      avatarUrl: racers.avatarUrl,
      createdAt: racers.createdAt,
      updatedAt: racers.updatedAt
    };

    const rows = search
      ? this.orm
          .selectDistinct(baseSelection)
          .from(racers)
          .leftJoin(identities, eq(identities.racerId, racers.id))
          .where(or(like(racers.displayName, `%${search}%`), like(identities.value, `%${search}%`)))
          .orderBy(asc(racers.displayName))
          .all()
      : this.orm.select(baseSelection).from(racers).orderBy(asc(racers.displayName)).all();

    return rows.map((row) => mapRacer(row, this.listIdentities(row.id)));
  }

  listEventRacers(eventId: string): Racer[] {
    const rows = this.orm
      .select({
        id: racers.id,
        displayName: racers.displayName,
        avatarUrl: racers.avatarUrl,
        createdAt: racers.createdAt,
        updatedAt: racers.updatedAt
      })
      .from(racers)
      .innerJoin(eventRacers, eq(eventRacers.racerId, racers.id))
      .where(eq(eventRacers.eventId, eventId))
      .orderBy(asc(racers.displayName))
      .all();

    return rows.map((row) => mapRacer(row, this.listIdentities(row.id)));
  }

  listResults(eventId?: string): RaceResult[] {
    const rows = eventId
      ? this.orm
          .select()
          .from(results)
          .where(eq(results.eventId, eventId))
          .orderBy(desc(results.createdAt))
          .all()
      : this.orm.select().from(results).orderBy(desc(results.createdAt)).all();

    return rows.map(mapResult);
  }

  listQueueEntries(eventId: string): QueueEntry[] {
    return this.orm
      .select()
      .from(queueEntries)
      .where(and(eq(queueEntries.eventId, eventId), ne(queueEntries.status, "removed")))
      .orderBy(asc(queueEntries.position))
      .all()
      .map(mapQueueEntry);
  }

  listQueueOccurrences(eventId: string): QueueOccurrence[] {
    return this.orm
      .select()
      .from(queueOccurrences)
      .where(and(eq(queueOccurrences.eventId, eventId), ne(queueOccurrences.status, "removed")))
      .orderBy(asc(queueOccurrences.signupSequence))
      .all()
      .map(mapQueueOccurrence);
  }

  getNextQueueSignupSequence(eventId: string): number {
    const row = this.orm
      .select({
        maxSequence: sql<number>`coalesce(max(${queueOccurrences.signupSequence}), 0)`
      })
      .from(queueOccurrences)
      .where(eq(queueOccurrences.eventId, eventId))
      .get();
    return (row?.maxSequence ?? 0) + 1;
  }

  createQueueEntry(
    eventId: string,
    racerIds: string[],
    requestedType: QueueEntry["requestedType"]
  ): QueueEntry {
    const row = this.orm
      .select({
        maxPosition: sql<number>`coalesce(max(${queueEntries.position}), 0)`
      })
      .from(queueEntries)
      .where(eq(queueEntries.eventId, eventId))
      .get();
    const position = (row?.maxPosition ?? 0) + 1;
    const timestamp = nowIso();
    const entry: QueueEntry = {
      id: nanoid(),
      eventId,
      type: racerIds.length > 1 ? "match" : "solo",
      requestedType,
      lockType: requestedType === "match" ? "challenge" : "flex",
      position,
      racerIds,
      occurrenceIds: [],
      priorityScore: 0,
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.upsertQueueEntries([entry]);
    return entry;
  }

  upsertQueueEntries(entries: QueueEntry[]): void {
    if (entries.length === 0) {
      return;
    }

    // Queue compaction frequently rewrites a run of neighboring entries at once, so
    // this keeps one prepared statement hot while the rest of the database surface
    // moves through Drizzle's typed query layer.
    const statement = this.db.prepare(
      "INSERT INTO queue_entries (id, event_id, type, requested_type, lock_type, position, racer_ids_json, occurrence_ids_json, priority_score, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET type = excluded.type, requested_type = excluded.requested_type, lock_type = excluded.lock_type, position = excluded.position, racer_ids_json = excluded.racer_ids_json, occurrence_ids_json = excluded.occurrence_ids_json, priority_score = excluded.priority_score, status = excluded.status, updated_at = excluded.updated_at"
    );
    const transaction = this.db.transaction((rows: QueueEntry[]) => {
      for (const entry of rows) {
        statement.run(
          entry.id,
          entry.eventId,
          entry.type,
          entry.requestedType,
          entry.lockType,
          entry.position,
          encodeJson(entry.racerIds),
          encodeJson(entry.occurrenceIds),
          entry.priorityScore,
          entry.status,
          entry.createdAt,
          entry.updatedAt
        );
      }
    });
    transaction(entries);
  }

  replaceQueueEntries(eventId: string, entries: QueueEntry[]): void {
    const transaction = this.db.transaction(() => {
      this.db.prepare("DELETE FROM queue_entries WHERE event_id = ?").run(eventId);
      this.upsertQueueEntries(entries);
    });
    transaction();
  }

  replaceQueuedQueueEntries(eventId: string, entries: QueueEntry[]): void {
    const transaction = this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM queue_entries WHERE event_id = ? AND status = 'queued'")
        .run(eventId);
      this.upsertQueueEntries(entries);
    });
    transaction();
  }

  upsertQueueOccurrences(occurrences: QueueOccurrence[]): void {
    if (occurrences.length === 0) {
      return;
    }

    const statement = this.db.prepare(
      "INSERT INTO queue_occurrences (id, event_id, racer_id, status, intent, lock_group_id, signup_sequence, bump_count, race_count_at_join, projected_position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, intent = excluded.intent, lock_group_id = excluded.lock_group_id, bump_count = excluded.bump_count, race_count_at_join = excluded.race_count_at_join, projected_position = excluded.projected_position, updated_at = excluded.updated_at"
    );
    const transaction = this.db.transaction((rows: QueueOccurrence[]) => {
      for (const occurrence of rows) {
        statement.run(
          occurrence.id,
          occurrence.eventId,
          occurrence.racerId,
          occurrence.status,
          occurrence.intent,
          occurrence.lockGroupId,
          occurrence.signupSequence,
          occurrence.bumpCount,
          occurrence.raceCountAtJoin,
          occurrence.projectedPosition,
          occurrence.createdAt,
          occurrence.updatedAt
        );
      }
    });
    transaction(occurrences);
  }

  saveQueueState(
    eventId: string,
    occurrences: QueueOccurrence[],
    queuedEntries: QueueEntry[]
  ): void {
    const occurrenceStatement = this.db.prepare(
      "INSERT INTO queue_occurrences (id, event_id, racer_id, status, intent, lock_group_id, signup_sequence, bump_count, race_count_at_join, projected_position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, intent = excluded.intent, lock_group_id = excluded.lock_group_id, bump_count = excluded.bump_count, race_count_at_join = excluded.race_count_at_join, projected_position = excluded.projected_position, updated_at = excluded.updated_at"
    );
    const entryStatement = this.db.prepare(
      "INSERT INTO queue_entries (id, event_id, type, requested_type, lock_type, position, racer_ids_json, occurrence_ids_json, priority_score, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET type = excluded.type, requested_type = excluded.requested_type, lock_type = excluded.lock_type, position = excluded.position, racer_ids_json = excluded.racer_ids_json, occurrence_ids_json = excluded.occurrence_ids_json, priority_score = excluded.priority_score, status = excluded.status, updated_at = excluded.updated_at"
    );
    const transaction = this.db.transaction(() => {
      for (const occurrence of occurrences) {
        occurrenceStatement.run(
          occurrence.id,
          occurrence.eventId,
          occurrence.racerId,
          occurrence.status,
          occurrence.intent,
          occurrence.lockGroupId,
          occurrence.signupSequence,
          occurrence.bumpCount,
          occurrence.raceCountAtJoin,
          occurrence.projectedPosition,
          occurrence.createdAt,
          occurrence.updatedAt
        );
      }

      this.db
        .prepare("DELETE FROM queue_entries WHERE event_id = ? AND status = 'queued'")
        .run(eventId);

      for (const entry of queuedEntries) {
        entryStatement.run(
          entry.id,
          entry.eventId,
          entry.type,
          entry.requestedType,
          entry.lockType,
          entry.position,
          encodeJson(entry.racerIds),
          encodeJson(entry.occurrenceIds),
          entry.priorityScore,
          entry.status,
          entry.createdAt,
          entry.updatedAt
        );
      }
    });
    transaction();
  }

  markQueueEntryStatus(entryId: string, status: QueueEntry["status"]): void {
    const existing = this.orm.select().from(queueEntries).where(eq(queueEntries.id, entryId)).get();
    this.orm
      .update(queueEntries)
      .set({
        status,
        updatedAt: nowIso()
      })
      .where(eq(queueEntries.id, entryId))
      .run();

    if (!existing || existing.occurrenceIdsJson.length === 0) {
      return;
    }

    this.orm
      .update(queueOccurrences)
      .set({
        status,
        updatedAt: nowIso()
      })
      .where(inArray(queueOccurrences.id, existing.occurrenceIdsJson))
      .run();
  }

  createRace(input: {
    eventId: string;
    queueEntryId?: string | null;
    tournamentId?: string | null;
    stageId?: string | null;
    mode: RaceRecord["mode"];
    format: RaceRecord["format"];
    themeId: string;
    targetDistanceMeters: number;
    participants: RaceParticipant[];
  }): RaceRecord {
    const raceId = nanoid();
    const timestamp = nowIso();

    this.orm
      .insert(races)
      .values({
        id: raceId,
        eventId: input.eventId,
        queueEntryId: input.queueEntryId ?? null,
        tournamentId: input.tournamentId ?? null,
        stageId: input.stageId ?? null,
        mode: input.mode,
        format: input.format,
        state: "scheduled",
        targetDistanceMeters: input.targetDistanceMeters,
        themeId: input.themeId,
        participantsJson: input.participants,
        metricsJson: [],
        winnerRacerId: null,
        countdownStartedAt: null,
        startedAt: null,
        finishedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .run();

    return this.getRace(raceId)!;
  }

  getRace(raceId: string): RaceRecord | null {
    const row = this.orm.select().from(races).where(eq(races.id, raceId)).get();
    return row ? mapRace(row) : null;
  }

  getCurrentRace(eventId: string): RaceRecord | null {
    const row = this.orm
      .select()
      .from(races)
      .where(and(eq(races.eventId, eventId), inArray(races.state, CURRENT_RACE_STATES)))
      .orderBy(desc(races.updatedAt))
      .get();

    return row ? mapRace(row) : null;
  }

  listRaces(eventId: string): RaceRecord[] {
    return this.orm
      .select()
      .from(races)
      .where(eq(races.eventId, eventId))
      .orderBy(desc(races.createdAt))
      .all()
      .map(mapRace);
  }

  updateRace(raceId: string, patch: Partial<RaceRecord>): RaceRecord {
    const existing = this.getRace(raceId);
    if (!existing) {
      throw new Error(`Missing race ${raceId}`);
    }

    const next: RaceRecord = {
      ...existing,
      ...patch,
      updatedAt: nowIso()
    };

    this.orm
      .update(races)
      .set({
        queueEntryId: next.queueEntryId,
        tournamentId: next.tournamentId,
        stageId: next.stageId,
        mode: next.mode,
        format: next.format,
        state: next.state,
        targetDistanceMeters: next.targetDistanceMeters,
        themeId: next.themeId,
        participantsJson: next.participants,
        metricsJson: next.metrics,
        winnerRacerId: next.winnerRacerId,
        countdownStartedAt: next.countdownStartedAt,
        startedAt: next.startedAt,
        finishedAt: next.finishedAt,
        updatedAt: next.updatedAt
      })
      .where(eq(races.id, raceId))
      .run();

    return this.getRace(raceId)!;
  }

  createResults(resultsToCreate: Omit<RaceResult, "id" | "createdAt">[]): RaceResult[] {
    const created = resultsToCreate.map((result) => ({
      ...result,
      id: nanoid(),
      createdAt: nowIso()
    }));

    if (created.length === 0) {
      return [];
    }

    this.orm
      .insert(results)
      .values(
        created.map((result) => ({
          id: result.id,
          eventId: result.eventId,
          raceId: result.raceId,
          racerId: result.racerId,
          lane: result.lane,
          placement: result.placement,
          finishTimeMs: result.finishTimeMs,
          distanceMeters: result.distanceMeters,
          avgSpeedKph: result.avgSpeedKph,
          topSpeedKph: result.topSpeedKph,
          maxWattage: result.maxWattage,
          createdAt: result.createdAt
        }))
      )
      .run();

    return created;
  }

  createTournamentBundle(bundle: {
    tournament: TournamentRecord;
    stages: TournamentStage[];
    seeds: TournamentParticipantSeed[];
    bracketNodes: BracketNode[];
    groupMatches: RoundRobinMatch[];
  }): TournamentBundle {
    this.orm.transaction((tx) => {
      tx.insert(tournaments)
        .values({
          id: bundle.tournament.id,
          eventId: bundle.tournament.eventId,
          name: bundle.tournament.name,
          preset: bundle.tournament.preset,
          status: bundle.tournament.status,
          settingsJson: {
            ...bundle.tournament.settings,
            seeds: bundle.seeds
          },
          createdAt: bundle.tournament.createdAt,
          updatedAt: bundle.tournament.updatedAt
        })
        .run();

      if (bundle.stages.length > 0) {
        tx.insert(tournamentStages)
          .values(
            bundle.stages.map((stage) => ({
              id: stage.id,
              tournamentId: stage.tournamentId,
              kind: stage.kind,
              name: stage.name,
              stageOrder: stage.order,
              settingsJson: stage.settings,
              createdAt: stage.createdAt,
              updatedAt: stage.updatedAt
            }))
          )
          .run();
      }

      if (bundle.bracketNodes.length > 0) {
        tx.insert(bracketNodes)
          .values(
            bundle.bracketNodes.map((node) => ({
              id: node.id,
              tournamentId: node.tournamentId,
              stageId: node.stageId,
              roundNumber: node.roundNumber,
              matchNumber: node.matchNumber,
              slotLabel: node.slotLabel,
              racerAId: node.racerAId,
              racerBId: node.racerBId,
              winnerRacerId: node.winnerRacerId,
              winnerToNodeId: node.winnerToNodeId,
              loserToNodeId: node.loserToNodeId,
              state: node.state,
              metaJson: node.meta,
              createdAt: node.createdAt,
              updatedAt: node.updatedAt
            }))
          )
          .run();
      }

      if (bundle.groupMatches.length > 0) {
        const stageId = bundle.stages[0]?.id ?? nanoid();
        tx.insert(groupMatches)
          .values(
            bundle.groupMatches.map((match) => {
              const timestamp = nowIso();
              return {
                id: match.id,
                tournamentId: bundle.tournament.id,
                stageId,
                racerAId: match.racerAId,
                racerBId: match.racerBId,
                winnerRacerId: match.winnerRacerId,
                scoreLabel: match.scoreLabel,
                createdAt: timestamp,
                updatedAt: timestamp
              };
            })
          )
          .run();
      }
    });

    return this.getTournamentBundle(bundle.tournament.id)!;
  }

  saveTournamentBundle(bundle: TournamentBundle): TournamentBundle {
    this.orm.transaction((tx) => {
      tx.update(tournaments)
        .set({
          name: bundle.tournament.name,
          preset: bundle.tournament.preset,
          status: bundle.tournament.status,
          settingsJson: {
            ...bundle.tournament.settings,
            seeds: bundle.seeds
          },
          updatedAt: bundle.tournament.updatedAt
        })
        .where(eq(tournaments.id, bundle.tournament.id))
        .run();

      tx.delete(bracketNodes).where(eq(bracketNodes.tournamentId, bundle.tournament.id)).run();
      if (bundle.bracketNodes.length > 0) {
        tx.insert(bracketNodes)
          .values(
            bundle.bracketNodes.map((node) => ({
              id: node.id,
              tournamentId: node.tournamentId,
              stageId: node.stageId,
              roundNumber: node.roundNumber,
              matchNumber: node.matchNumber,
              slotLabel: node.slotLabel,
              racerAId: node.racerAId,
              racerBId: node.racerBId,
              winnerRacerId: node.winnerRacerId,
              winnerToNodeId: node.winnerToNodeId,
              loserToNodeId: node.loserToNodeId,
              state: node.state,
              metaJson: node.meta,
              createdAt: node.createdAt,
              updatedAt: node.updatedAt
            }))
          )
          .run();
      }

      tx.delete(groupMatches).where(eq(groupMatches.tournamentId, bundle.tournament.id)).run();
      if (bundle.groupMatches.length > 0) {
        const groupStageId =
          bundle.stages.find((stage) => stage.kind === "groups" || stage.kind === "round-robin")
            ?.id ?? bundle.stages[0].id;

        tx.insert(groupMatches)
          .values(
            bundle.groupMatches.map((match) => {
              const timestamp = nowIso();
              return {
                id: match.id,
                tournamentId: bundle.tournament.id,
                stageId: groupStageId,
                racerAId: match.racerAId,
                racerBId: match.racerBId,
                winnerRacerId: match.winnerRacerId,
                scoreLabel: match.scoreLabel,
                createdAt: timestamp,
                updatedAt: timestamp
              };
            })
          )
          .run();
      }
    });

    return this.getTournamentBundle(bundle.tournament.id)!;
  }

  listTournamentBundles(eventId: string): TournamentBundle[] {
    return this.orm
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(eq(tournaments.eventId, eventId))
      .orderBy(desc(tournaments.createdAt))
      .all()
      .map((row) => this.getTournamentBundle(row.id))
      .filter((bundle): bundle is TournamentBundle => Boolean(bundle));
  }

  getTournamentBundle(tournamentId: string): TournamentBundle | null {
    const tournamentRow = this.orm
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .get();
    if (!tournamentRow) {
      return null;
    }

    const stages = this.orm
      .select()
      .from(tournamentStages)
      .where(eq(tournamentStages.tournamentId, tournamentId))
      .orderBy(asc(tournamentStages.stageOrder))
      .all()
      .map(mapTournamentStage);

    const tournamentNodes = this.orm
      .select()
      .from(bracketNodes)
      .where(eq(bracketNodes.tournamentId, tournamentId))
      .orderBy(asc(bracketNodes.roundNumber), asc(bracketNodes.matchNumber))
      .all()
      .map(mapBracketNode);

    const roundRobinMatches = this.orm
      .select()
      .from(groupMatches)
      .where(eq(groupMatches.tournamentId, tournamentId))
      .orderBy(asc(groupMatches.createdAt))
      .all()
      .map(mapGroupMatch);

    const seeds = tournamentRow.settingsJson.seeds ?? [];
    const standings = computeRoundRobinStandings(seeds, roundRobinMatches);

    return {
      tournament: mapTournament(tournamentRow),
      stages,
      bracketNodes: tournamentNodes,
      groupMatches: roundRobinMatches,
      standings,
      seeds
    };
  }
}
