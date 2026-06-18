import { useReducer } from "react";
import type { Dispatch, ReactElement, SetStateAction } from "react";
import { competitionPresets } from "@roller-rumble/shared/presets";
import type {
  TournamentBracketLayoutMode,
  TournamentBracketSize,
  TournamentPreset
} from "@roller-rumble/shared/types";
import { EventTab } from "../components/admin/event-tab";
import { AdminRaceTray } from "../components/admin/race-tray";
import { RaceTab } from "../components/admin/race-tab";
import { RacersTab } from "../components/admin/racers-tab";
import { SettingsTab } from "../components/admin/settings-tab";
import { AdminTabRail } from "../components/admin/tab-rail";
import { TournamentsTab } from "../components/admin/tournaments-tab";
import { adminTabs, type AdminTabId } from "../components/admin/types";
import {
  getActiveTournament,
  getBracketLayoutOptions,
  getBracketSizeOptions,
  getCompetitionLabel,
  getTournamentBracketLayoutMode,
  getTournamentBracketSize,
  supportsBracketSizing,
  supportsCenterConvergingBracketLayout
} from "../lib/admin-competition";
import { registerRacer, signUpQueue, updateSettings } from "../lib/api";
import { useMetaQuery, useSnapshotQuery } from "../lib/query";
import { fireAndForget } from "../lib/ui-actions";

interface AdminPageState {
  activeTab: AdminTabId;
  adminQueueOpponentId: string;
  adminQueueRacerId: string;
  adminQueueRequestedType: "auto-match" | "solo";
  newEventName: string;
  raceDistanceInput: string;
  racerEmail: string;
  racerName: string;
  racerPhone: string;
  search: string;
  tournamentBracketLayout: TournamentBracketLayoutMode;
  tournamentBracketSize: TournamentBracketSize;
  tournamentBracketSizeTouched: boolean;
  tournamentName: string;
  tournamentPreset: TournamentPreset;
}

const initialAdminPageState: AdminPageState = {
  activeTab: "event",
  adminQueueOpponentId: "",
  adminQueueRacerId: "",
  adminQueueRequestedType: "auto-match",
  newEventName: "",
  raceDistanceInput: "",
  racerEmail: "",
  racerName: "",
  racerPhone: "",
  search: "",
  tournamentBracketLayout: "auto",
  tournamentBracketSize: 8,
  tournamentBracketSizeTouched: false,
  tournamentName: "Bracket Night",
  tournamentPreset: "single-elimination"
};

function adminPageReducer(state: AdminPageState, patch: Partial<AdminPageState>): AdminPageState {
  return { ...state, ...patch };
}

function resolveStateAction<T>(action: SetStateAction<T>, currentValue: T): T {
  return typeof action === "function" ? (action as (value: T) => T)(currentValue) : action;
}

export function AdminPage() {
  const snapshotQuery = useSnapshotQuery();
  const metaQuery = useMetaQuery();
  const snapshot = snapshotQuery.data;
  const [state, setState] = useReducer(adminPageReducer, initialAdminPageState);
  const {
    activeTab,
    adminQueueOpponentId,
    adminQueueRacerId,
    adminQueueRequestedType,
    newEventName,
    raceDistanceInput,
    racerEmail,
    racerName,
    racerPhone,
    search,
    tournamentBracketLayout,
    tournamentBracketSize,
    tournamentBracketSizeTouched,
    tournamentName,
    tournamentPreset
  } = state;
  const setActiveTab: Dispatch<SetStateAction<AdminTabId>> = (action) => {
    setState({ activeTab: resolveStateAction(action, activeTab) });
  };
  const setAdminQueueRacerId: Dispatch<SetStateAction<string>> = (action) => {
    setState({ adminQueueRacerId: resolveStateAction(action, adminQueueRacerId) });
  };
  const setAdminQueueOpponentId: Dispatch<SetStateAction<string>> = (action) => {
    setState({ adminQueueOpponentId: resolveStateAction(action, adminQueueOpponentId) });
  };
  const setAdminQueueRequestedType: Dispatch<SetStateAction<"auto-match" | "solo">> = (action) => {
    setState({
      adminQueueRequestedType: resolveStateAction(action, adminQueueRequestedType)
    });
  };
  const setRaceDistanceInput: Dispatch<SetStateAction<string>> = (action) => {
    setState({ raceDistanceInput: resolveStateAction(action, raceDistanceInput) });
  };
  const setSearch: Dispatch<SetStateAction<string>> = (action) => {
    setState({ search: resolveStateAction(action, search) });
  };
  const setNewEventName: Dispatch<SetStateAction<string>> = (action) => {
    setState({ newEventName: resolveStateAction(action, newEventName) });
  };
  const setRacerName: Dispatch<SetStateAction<string>> = (action) => {
    setState({ racerName: resolveStateAction(action, racerName) });
  };
  const setRacerEmail: Dispatch<SetStateAction<string>> = (action) => {
    setState({ racerEmail: resolveStateAction(action, racerEmail) });
  };
  const setRacerPhone: Dispatch<SetStateAction<string>> = (action) => {
    setState({ racerPhone: resolveStateAction(action, racerPhone) });
  };
  const setTournamentName: Dispatch<SetStateAction<string>> = (action) => {
    setState({ tournamentName: resolveStateAction(action, tournamentName) });
  };
  const setTournamentPreset: Dispatch<SetStateAction<TournamentPreset>> = (action) => {
    setState({ tournamentPreset: resolveStateAction(action, tournamentPreset) });
  };
  const setTournamentBracketSize: Dispatch<SetStateAction<TournamentBracketSize>> = (action) => {
    setState({
      tournamentBracketSize: resolveStateAction(action, tournamentBracketSize)
    });
  };
  const setTournamentBracketSizeTouched: Dispatch<SetStateAction<boolean>> = (action) => {
    setState({
      tournamentBracketSizeTouched: resolveStateAction(action, tournamentBracketSizeTouched)
    });
  };
  const setTournamentBracketLayout: Dispatch<SetStateAction<TournamentBracketLayoutMode>> = (
    action
  ) => {
    setState({
      tournamentBracketLayout: resolveStateAction(action, tournamentBracketLayout)
    });
  };

  const normalizedRacerSearch = search.trim().toLowerCase();
  const filteredRacers = snapshot
    ? snapshot.racers.filter((entry) =>
        entry.racer.displayName.toLowerCase().includes(normalizedRacerSearch)
      )
    : [];

  const tournamentPresetSupportsBracketSizing = supportsBracketSizing(tournamentPreset);
  const tournamentPresetSupportsCenterConverging =
    supportsCenterConvergingBracketLayout(tournamentPreset);
  const tournamentBracketSizeOptions = tournamentPresetSupportsBracketSizing
    ? getBracketSizeOptions(tournamentPreset)
    : [];
  const tournamentBracketLayoutOptions = getBracketLayoutOptions(tournamentPreset);
  const registeredRacerCount = snapshot?.racers.length ?? 0;
  const suggestedBracketSize =
    tournamentBracketSizeOptions.find((size) => size >= registeredRacerCount) ??
    tournamentBracketSizeOptions[tournamentBracketSizeOptions.length - 1];
  const selectedBracketSize = tournamentPresetSupportsBracketSizing
    ? tournamentBracketSizeTouched && tournamentBracketSizeOptions.includes(tournamentBracketSize)
      ? tournamentBracketSize
      : suggestedBracketSize
    : undefined;

  if (!snapshot) {
    return <p>Loading admin console…</p>;
  }

  const settings = snapshot.settings;
  const currentRace = snapshot.raceProjection.race;
  const activeTournament = getActiveTournament(snapshot);
  const activeTournamentBracketSize = activeTournament
    ? getTournamentBracketSize(activeTournament)
    : null;
  const activeTournamentBracketLayout = activeTournament
    ? getTournamentBracketLayoutMode(activeTournament)
    : "auto";
  const completedTournaments = snapshot.tournaments.filter(
    (bundle) => bundle.tournament.status !== "active"
  );
  const tournamentPresetOptions = competitionPresets.filter(
    (preset) => preset.id !== "open-time-trial"
  );
  const competitionLabel = getCompetitionLabel(snapshot);
  const tournamentRaceLocked = Boolean(
    currentRace && ["staging", "countdown", "active", "interrupted"].includes(currentRace.state)
  );
  const defaultEventName = `Event ${new Date().toLocaleDateString()}`;
  const resolvedEventName = newEventName || defaultEventName;
  const activeTabConfig = adminTabs.find((tab) => tab.id === activeTab) ?? adminTabs[0];
  const displayedRaceDistanceInput =
    raceDistanceInput === "" ? String(settings.targetDistanceMeters) : raceDistanceInput;
  const settingsThemeLabel =
    snapshot.themes.find((theme) => theme.id === settings.themeId)?.label ?? settings.themeId;

  async function handleQuickAddRacer(): Promise<void> {
    await registerRacer({
      displayName: racerName,
      email: racerEmail || undefined,
      phone: racerPhone || undefined
    });
    setRacerName("");
    setRacerEmail("");
    setRacerPhone("");
  }

  async function handleAdminQueueSignup(): Promise<void> {
    if (!adminQueueRacerId) {
      return;
    }

    await signUpQueue({
      racerId: adminQueueRacerId,
      opponentRacerId: adminQueueOpponentId || undefined,
      requestedType: adminQueueOpponentId ? undefined : adminQueueRequestedType
    });
    setAdminQueueRacerId("");
    setAdminQueueOpponentId("");
    setAdminQueueRequestedType("auto-match");
  }

  async function handleRaceDistanceSave(): Promise<void> {
    const parsed = Number(displayedRaceDistanceInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setRaceDistanceInput("");
      return;
    }

    await updateSettings({
      targetDistanceMeters: Math.round(parsed)
    });
    setRaceDistanceInput("");
  }

  let activeTabContent: ReactElement;
  switch (activeTab) {
    case "event":
      activeTabContent = (
        <EventTab
          snapshot={snapshot}
          settingsThemeLabel={settingsThemeLabel}
          activeTournament={activeTournament}
          currentRace={currentRace}
          competitionLabel={competitionLabel}
          newEventName={newEventName}
          resolvedEventName={resolvedEventName}
          setNewEventName={setNewEventName}
        />
      );
      break;
    case "race":
      activeTabContent = (
        <RaceTab
          snapshot={snapshot}
          settingsTargetDistanceMeters={settings.targetDistanceMeters}
          currentRace={currentRace}
          displayedRaceDistanceInput={displayedRaceDistanceInput}
          setRaceDistanceInput={setRaceDistanceInput}
          onSaveRaceDistance={() => {
            fireAndForget(handleRaceDistanceSave(), "save race distance");
          }}
          adminQueueRacerId={adminQueueRacerId}
          setAdminQueueRacerId={setAdminQueueRacerId}
          adminQueueOpponentId={adminQueueOpponentId}
          setAdminQueueOpponentId={setAdminQueueOpponentId}
          adminQueueRequestedType={adminQueueRequestedType}
          setAdminQueueRequestedType={setAdminQueueRequestedType}
          onAdminQueueSignup={() => {
            fireAndForget(handleAdminQueueSignup(), "admin queue signup");
          }}
        />
      );
      break;
    case "racers":
      activeTabContent = (
        <RacersTab
          filteredRacers={filteredRacers}
          search={search}
          setSearch={setSearch}
          racerName={racerName}
          setRacerName={setRacerName}
          racerEmail={racerEmail}
          setRacerEmail={setRacerEmail}
          racerPhone={racerPhone}
          setRacerPhone={setRacerPhone}
          onQuickAddRacer={() => {
            fireAndForget(handleQuickAddRacer(), "quick add racer");
          }}
          paymentRequiredForQueue={snapshot.activeEvent.paymentRequiredForQueue}
        />
      );
      break;
    case "tournaments":
      activeTabContent = (
        <TournamentsTab
          snapshot={snapshot}
          activeTournament={activeTournament}
          activeTournamentBracketSize={activeTournamentBracketSize}
          activeTournamentBracketLayout={activeTournamentBracketLayout}
          completedTournaments={completedTournaments}
          tournamentPresetOptions={tournamentPresetOptions}
          tournamentPresetSupportsBracketSizing={tournamentPresetSupportsBracketSizing}
          tournamentPresetSupportsCenterConverging={tournamentPresetSupportsCenterConverging}
          tournamentBracketSizeOptions={tournamentBracketSizeOptions}
          tournamentBracketLayoutOptions={tournamentBracketLayoutOptions}
          tournamentName={tournamentName}
          setTournamentName={setTournamentName}
          tournamentPreset={tournamentPreset}
          setTournamentPreset={setTournamentPreset}
          setTournamentBracketSizeTouched={setTournamentBracketSizeTouched}
          selectedBracketSize={selectedBracketSize}
          setTournamentBracketSize={setTournamentBracketSize}
          tournamentBracketLayout={tournamentBracketLayout}
          setTournamentBracketLayout={setTournamentBracketLayout}
          tournamentRaceLocked={tournamentRaceLocked}
        />
      );
      break;
    case "settings":
      activeTabContent = <SettingsTab snapshot={snapshot} meta={metaQuery.data} />;
      break;
  }

  return (
    <div className="admin-layout">
      <AdminTabRail activeTab={activeTab} setActiveTab={setActiveTab} />

      <section className="admin-workspace">
        <header className="admin-workspace__header">
          <div>
            <p className="eyebrow">Admin Console</p>
            <h1>{activeTabConfig.label}</h1>
          </div>
          <p className="admin-workspace__description">{activeTabConfig.description}</p>
        </header>
        <div className="admin-workspace__scroll">{activeTabContent}</div>
        <AdminRaceTray
          snapshot={snapshot}
          activeTournament={activeTournament}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
      </section>
    </div>
  );
}
