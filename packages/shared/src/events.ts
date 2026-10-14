export const EVENT_TYPES = [
  'player_join','player_leave','player_death','player_chat','admin_action','violation',
  'economy_tx','fame_change','quest_update','chest_ownership','gameplay_event',
  'lockpick','disarm','bunker_minigame','chest_action','trap_action','base_building','bunker_lock',
  'vehicle_event','loot_event','server_event','unknown'
] as const;
export type EventType = typeof EVENT_TYPES[number];
export const FAMILIES = [
  'login','kill','chat','admin','violations','economy','famepoints','quests','chest_ownership',
  'gameplay','vehicle_destruction','raid_protection','sentry','base_building_destruction',
  'armor_absorption','network_objects','server_notifications','event_kill','loot','unknown'
] as const;
export type Family = typeof FAMILIES[number];
export type Metadata = Record<string, string | number | boolean | null | object>;
export interface Event {
  id?: number;
  ts: string | null;
  server_id: string | null;
  family: Family;
  event_type: EventType;
  actor_steam_id?: string | null;
  actor_name?: string | null;
  actor_char_id?: string | null;
  target_steam_id?: string | null;
  target_name?: string | null;
  target_char_id?: string | null;
  message?: string | null;
  x?: number | null;
  y?: number | null;
  z?: number | null;
  metadata: Metadata;
  raw: string;
  source_file: string;
  source_line_no: number;
  created_at?: string;
}

