const BASE_MENUS = [
  {
    "group": "战斗与安全",
    "key": "kill",
    "label": "击杀日志",
    "permission": "log.kill.view",
    "sql": "family='kill'",
    "families": [
      "kill"
    ],
    "note": ""
  },
  {
    "group": "战斗与安全",
    "key": "event_kill",
    "label": "活动击杀",
    "permission": "log.event_kill.view",
    "sql": "family='event_kill'",
    "families": [
      "event_kill"
    ],
    "note": ""
  },
  {
    "group": "战斗与安全",
    "key": "armor_absorption",
    "label": "护甲吸收",
    "permission": "log.armor_absorption.view",
    "sql": "family='armor_absorption'",
    "families": [
      "armor_absorption"
    ],
    "note": ""
  },
  {
    "group": "战斗与安全",
    "key": "sentry",
    "label": "哨兵日志",
    "permission": "log.sentry.view",
    "sql": "family='sentry'",
    "families": [
      "sentry"
    ],
    "note": ""
  },
  {
    "group": "战斗与安全",
    "key": "violations",
    "label": "违规日志",
    "permission": "log.violations.view",
    "sql": "family='violations'",
    "families": [
      "violations"
    ],
    "note": ""
  },
  {
    "group": "战斗与安全",
    "key": "lockpick",
    "label": "撬锁日志",
    "permission": "log.lockpick.view",
    "sql": "family='gameplay' AND (event_type='lockpick' OR (event_type='gameplay_event' AND json_extract(metadata,'$.subfamily')='LogMinigame' AND (json_extract(metadata,'$.details') LIKE '[LockpickingMinigame_C] %' OR json_extract(metadata,'$.details') LIKE '[BP_LockpickingMinigame_C] %' OR json_extract(metadata,'$.details') LIKE '[BP_DialLockMinigame_C] %' OR json_extract(metadata,'$.details') LIKE '[DialLockMinigame_C] %')))",
    "families": [
      "gameplay"
    ],
    "note": "挂锁和密码锁小游戏；地堡密码面板及地堡锁定不属撬锁"
  },
  {
    "group": "玩家活动",
    "key": "login",
    "label": "登录日志",
    "permission": "log.login.view",
    "sql": "family='login'",
    "families": [
      "login"
    ],
    "note": ""
  },
  {
    "group": "玩家活动",
    "key": "chat",
    "label": "聊天日志",
    "permission": "log.chat.view",
    "sql": "family='chat'",
    "families": [
      "chat"
    ],
    "note": ""
  },
  {
    "group": "玩家活动",
    "key": "famepoints",
    "label": "声望日志",
    "permission": "log.famepoints.view",
    "sql": "family='famepoints'",
    "families": [
      "famepoints"
    ],
    "note": ""
  },
  {
    "group": "玩家活动",
    "key": "quests",
    "label": "任务日志",
    "permission": "log.quests.view",
    "sql": "family='quests'",
    "families": [
      "quests"
    ],
    "note": ""
  },
  {
    "group": "经济与物品",
    "key": "bank",
    "label": "银行日志",
    "permission": "log.bank.view",
    "sql": "family='economy' AND event_type='economy_tx' AND json_extract(metadata,'$.operation') IN ('card_purchase','card_destroy','deposit','currency_conversion','transfer')",
    "families": [
      "economy"
    ],
    "note": "卡片、存款、gold/credits 转换"
  },
  {
    "group": "经济与物品",
    "key": "economy",
    "label": "交易日志",
    "permission": "log.economy.view",
    "sql": "family='economy' AND NOT COALESCE((family='economy' AND event_type='economy_tx' AND json_extract(metadata,'$.operation') IN ('card_purchase','card_destroy','deposit','currency_conversion','transfer')),0)",
    "families": [
      "economy"
    ],
    "note": "交易及余额快照；包含本族版本行"
  },
  {
    "group": "经济与物品",
    "key": "loot",
    "label": "掉落日志",
    "permission": "log.loot.view",
    "sql": "family='loot'",
    "families": [
      "loot"
    ],
    "note": ""
  },
  {
    "group": "经济与物品",
    "key": "chest_ownership",
    "label": "箱子归属",
    "permission": "log.chest_ownership.view",
    "sql": "family='chest_ownership'",
    "families": [
      "chest_ownership"
    ],
    "note": ""
  },
  {
    "group": "载具与建造",
    "key": "vehicle_destruction",
    "label": "载具日志",
    "permission": "log.vehicle_destruction.view",
    "sql": "family='vehicle_destruction' OR (family='gameplay' AND event_type='vehicle_event')",
    "families": [
      "vehicle_destruction",
      "gameplay"
    ],
    "note": "暂无已证实 gameplay 载具事件；不以物品名含载具推断"
  },
  {
    "group": "载具与建造",
    "key": "base_building_destruction",
    "label": "建筑损毁",
    "permission": "log.base_building_destruction.view",
    "sql": "family='base_building_destruction'",
    "families": [
      "base_building_destruction"
    ],
    "note": ""
  },
  {
    "group": "载具与建造",
    "key": "raid_protection",
    "label": "领地保护",
    "permission": "log.raid_protection.view",
    "sql": "family='raid_protection'",
    "families": [
      "raid_protection"
    ],
    "note": ""
  },
  {
    "group": "载具与建造",
    "key": "gameplay",
    "label": "其他游戏日志",
    "permission": "log.gameplay.view",
    "sql": "family='gameplay' AND NOT COALESCE((family='gameplay' AND (event_type='lockpick' OR (event_type='gameplay_event' AND json_extract(metadata,'$.subfamily')='LogMinigame' AND (json_extract(metadata,'$.details') LIKE '[LockpickingMinigame_C] %' OR json_extract(metadata,'$.details') LIKE '[BP_LockpickingMinigame_C] %' OR json_extract(metadata,'$.details') LIKE '[BP_DialLockMinigame_C] %' OR json_extract(metadata,'$.details') LIKE '[DialLockMinigame_C] %')))),0) AND event_type!='vehicle_event'",
    "families": [
      "gameplay"
    ],
    "note": ""
  },
  {
    "group": "服务器管理",
    "key": "admin",
    "label": "管理与维护",
    "permission": "log.admin.view",
    "sql": "family='admin'",
    "families": [
      "admin"
    ],
    "note": ""
  },
  {
    "group": "服务器管理",
    "key": "network_objects",
    "label": "网络对象",
    "permission": "log.network_objects.view",
    "sql": "family='network_objects'",
    "families": [
      "network_objects"
    ],
    "note": ""
  },
  {
    "group": "服务器管理",
    "key": "server_notifications",
    "label": "服务器通知",
    "permission": "log.server_notifications.view",
    "sql": "family='server_notifications'",
    "families": [
      "server_notifications"
    ],
    "note": ""
  },
  {
    "group": "服务器管理",
    "key": "unknown",
    "label": "其他记录",
    "permission": "log.unknown.view",
    "sql": "family='unknown'",
    "families": [
      "unknown"
    ],
    "note": "各已知族的 unknown 仍在原所属菜单"
  }
] as const;


const behavior=[
 {key:'trap',label:'陷阱',sub:"json_extract(metadata,'$.subfamily')='LogTrap'"},
 {key:'disarm',label:'排爆',sub:"json_extract(metadata,'$.subfamily')='LogMinigame' AND json_extract(metadata,'$.minigame') LIKE '%Defusal%' AND json_extract(metadata,'$.minigame') NOT LIKE 'Not%'"},
 {key:'territory',label:'领地',sub:"json_extract(metadata,'$.subfamily')='LogBaseBuilding'"},
 {key:'chest',label:'箱子行为',sub:"json_extract(metadata,'$.subfamily')='LogChest'"},
 {key:'bunker-minigame',label:'地堡小游戏',sub:"event_type='bunker_minigame' OR (json_extract(metadata,'$.subfamily')='LogMinigame' AND json_extract(metadata,'$.minigame') IN ('AbandonedBunkerSlaveSwitchboardMinigame_01_C','AbandonedBunkerMasterSwitchboardMinigame_01_C'))"},
 {key:'bunker-state',label:'地堡状态',sub:"json_extract(metadata,'$.subfamily')='LogBunkerLock'"},
 {key:'lock-install',label:'下锁记录',sub:"json_extract(metadata,'$.operation')='lock_install'"}
];
const exclusions=behavior.map(m=>'('+m.sub+')').join(' OR ');
const LOG_MENUS_BASE=[...BASE_MENUS.map(m=>({...m,
 group:['login','kill','chat','lockpick','bank'].includes(m.key)?'核心记录':['admin','violations','server_notifications','network_objects','unknown'].includes(m.key)?'服务器记录':'玩家行为',
 label:m.key==='economy'?'商人交易':m.key==='bank'?'银行':m.key==='admin'?'管理':m.label,
 sql:m.key==='gameplay'?m.sql+` AND NOT COALESCE((${exclusions}),0)`:m.key==='admin'?m.sql+" AND event_type!='server_event' AND NOT COALESCE(json_extract(metadata,'$.deletion_kind') IS NOT NULL,0)":m.sql
})),...behavior.map(m=>({key:m.key,label:m.label,group:'玩家行为',permission:'log.'+m.key+'.view',sql:"family='gameplay' AND ("+m.sub+")",families:['gameplay'] as const,note:'按日志明确行为分类，不改变日志族'})),
 {key:'character-delete',label:'删除角色',group:'服务器记录',permission:'log.character-delete.view',sql:"family='admin' AND json_extract(metadata,'$.deletion_kind') IS NOT NULL",families:['admin'] as const,note:'周期清理与人工删除分别呈现'},
 {key:'maintenance',label:'维护',group:'服务器记录',permission:'log.maintenance.view',sql:"family='admin' AND event_type='server_event' AND json_extract(metadata,'$.deletion_kind') IS NULL",families:['admin'] as const,note:'管理日志中的版本、清理和维护记录'}
];
// Preserve existing gameplay grants; only the public route changes.
export const LOG_MENUS=LOG_MENUS_BASE.map(m=>m.key==='gameplay'?{...m,key:'gameplay-other',label:'其他游戏记录'}:m);
export type LogMenu=typeof LOG_MENUS[number];
