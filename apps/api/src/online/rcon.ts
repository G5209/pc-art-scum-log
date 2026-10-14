// This adapter reads an existing HTTP GET/cache result. It never submits IPC
// requests and is not an implementation of an unconfirmed official RCON socket.
export {RconClient,parseListPlayers} from '../rcon/client';
export type {OnlinePlayer} from '../rcon/client';
