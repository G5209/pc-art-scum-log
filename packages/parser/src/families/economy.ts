import type { Event } from '@scum/shared';
import { base, parseLineParts } from '../helpers';
import type { ParseCtx } from '../types';
const trade=/^\[(?<prefix>Trade|Trade-Mechanic)\] (?<kind>Tradeable|Service) \((?<item>.+)\) (?<action>sold|purchased) by (?<name>.*?)\((?<steam>\d{16,17})\) for (?<amount>[\d.]+)(?<pricing>.*?) (?:to|from) trader (?<trader>[^,]+)(?:, old amount in store (?:is|was) (?<old>-?\d+), new amount is (?<new>-?\d+))?, and effective users online: (?<online>\d+)$/;
const balance=/^\[Trade\] (?<phase>Before|After) (?<details>.+?) (?:to|from) trader (?<trader>[^,]+), player (?<name>.*?)\((?<steam>\d{16,17})\) (?:had|has) (?<cash>[\d.]+) cash, (?<account>-?[\d.]+) (?:bank )?account balance and (?<gold>[\d.]+) gold and trader (?:had|has) (?<funds>[\d.]+) funds\.$/;
const bankActor=/^\[(?<prefix>Bank|Currency Conversion)\] (?<name>.*?)\(ID:(?<steam>\d{16,17})\)\(Account Number:(?<account>\d+)\) (?<details>.+?) (?:at )?X=(?<x>-?[\d.]+) Y=(?<y>-?[\d.]+) Z=(?<z>-?\d+(?:\.\d+)?)\.?$/;
export function parseLine(line:string,ctx:ParseCtx):Event|null {
 const p=parseLineParts(line);
 const rename=/^Player (?<oldName>.*?) \((?<char>\d+),\s*(?<steam>\d{16,17})\) changed their name to (?<newName>.+?)\.$/.exec(p.body)?.groups;
 if(rename)return {...base(ctx,p,'gameplay_event',{operation:'player_rename',old_name:rename.oldName,new_name:rename.newName}),actor_name:rename.newName,actor_char_id:rename.char,actor_steam_id:rename.steam,message:p.body};
 let g=trade.exec(p.body)?.groups;
 if(g){const q=/\(x(\d+)\)/.exec(g.item),h=/health: ([\d.]+), uses: (\d+)/.exec(g.item),w=/\(([\d.]+) \+ ([\d.]+) worth of contained items\)/.exec(g.pricing);return {...base(ctx,p,'economy_tx',{operation:g.action==='sold'?'sale':'purchase',raw_prefix:g.prefix,trade_kind:g.kind,item:g.item,item_class:g.item.replace(/\s*\(.*/,''),quantity:q?Number(q[1]):null,health:h?Number(h[1]):null,uses:h?Number(h[2]):null,amount:Number(g.amount),currency:g.pricing.trim()==='money'?'money':null,base_price:w?Number(w[1]):null,contained_items_value:w?Number(w[2]):null,trader:g.trader,store_quantity_before:g.old?Number(g.old):null,store_quantity_after:g.new?Number(g.new):null,effective_users_online:Number(g.online)}),actor_name:g.name,actor_steam_id:g.steam,message:p.body};}
 g=balance.exec(p.body)?.groups;if(g)return {...base(ctx,p,'economy_tx',{operation:'balance_snapshot',phase:g.phase.toLowerCase(),details:g.details,trader:g.trader,cash:Number(g.cash),account_balance:Number(g.account),gold:Number(g.gold),trader_funds:Number(g.funds)}),actor_name:g.name,actor_steam_id:g.steam,message:p.body};
 g=bankActor.exec(p.body)?.groups;if(!g)return null;
 const common={...base(ctx,p,'economy_tx',{raw_prefix:g.prefix,account_number:g.account}),actor_name:g.name,actor_steam_id:g.steam,message:p.body,x:Number(g.x),y:Number(g.y),z:Number(g.z)};
 const card=/^purchased (?<card>\w+) card \(free renewal: (?<free>yes|no)\), new account balance is (?<balance>[\d.]+) credits,$/.exec(g.details)?.groups;
 if(card)return {...common,metadata:{...common.metadata,operation:'card_purchase',card_type:card.card,free_renewal:card.free==='yes',account_balance:Number(card.balance),currency:'credits'}};
 const destroy=/^manually destroyed (?<card>\w+) card belonging to Account Number:(?<account>\d+),$/.exec(g.details)?.groups;
 if(destroy)return {...common,metadata:{...common.metadata,operation:'card_destroy',card_type:destroy.card,target_account_number:destroy.account}};
 const deposit=/^deposited (?<amount>[\d.]+)\((?<net>[\d.]+) was added\) to Account Number: (?<account>\d+)\((?<name>.*?)\)\((?<steam>\d{16,17})\)$/.exec(g.details)?.groups;
 if(deposit)return {...common,target_name:deposit.name,target_steam_id:deposit.steam,metadata:{...common.metadata,operation:'deposit',amount:Number(deposit.amount),net_amount:Number(deposit.net),target_account_number:deposit.account,currency:null}};
 const transfer=/^transferred (?<amount>[\d.]+)\((?<removed>[\d.]+) was removed\) from Account Number: (?<sourceAccount>\d+)\((?<sourceName>.*?)\)\((?<sourceSteam>\d{16,17})\) to Account Number: (?<targetAccount>\d+)\((?<targetName>.*?)\)\((?<targetSteam>\d{16,17})\)$/.exec(g.details)?.groups;
 if(transfer)return {...common,target_name:transfer.targetName,target_steam_id:transfer.targetSteam,metadata:{...common.metadata,operation:'transfer',amount:Number(transfer.amount),removed_amount:Number(transfer.removed),source_account_number:transfer.sourceAccount,source_name:transfer.sourceName,source_steam_id:transfer.sourceSteam,target_account_number:transfer.targetAccount,currency:null}};
 const conversion=/^(?<action>sold|purchased) (?<gold>[\d.]+) gold for (?<credits>[\d.]+) credits \(new account balance is (?<newGold>[\d.]+) gold\/(?<newCredits>-?[\d.]+) credits\)$/.exec(g.details)?.groups;
 if(conversion){const purchase=conversion.action==='purchased';return {...common,metadata:{...common.metadata,operation:'currency_conversion',conversion_action:conversion.action,currency_from:purchase?'credits':'gold',currency_to:purchase?'gold':'credits',amount_from:Number(purchase?conversion.credits:conversion.gold),amount_to:Number(purchase?conversion.gold:conversion.credits),gold:Number(conversion.newGold),account_balance:Number(conversion.newCredits)}};}
 return null;
}

