import type { ServerMessage } from "@yt/contracts";

// The parts of a ws WebSocket the hub uses; tests pass a fake.
export interface Socket {
  readonly readyState: number;
  send(data: string): void;
  ping(): void;
  terminate(): void;
}

const OPEN = 1;

interface ClientState {
  userId: string | null;
  alive: boolean;
}

/** The sockets connected to this instance, and which user each one belongs to. */
export class ClientHub {
  private readonly clients = new Map<Socket, ClientState>();

  get size(): number {
    return this.clients.size;
  }

  add(socket: Socket): void {
    this.clients.set(socket, { userId: null, alive: true });
  }

  remove(socket: Socket): void {
    this.clients.delete(socket);
  }

  identify(socket: Socket, userId: string): void {
    const state = this.clients.get(socket);
    if (state) state.userId = userId;
  }

  markAlive(socket: Socket): void {
    const state = this.clients.get(socket);
    if (state) state.alive = true;
  }

  send(socket: Socket, message: ServerMessage): void {
    if (socket.readyState === OPEN) socket.send(JSON.stringify(message));
  }

  /** Returns how many sockets received it. */
  broadcast(message: ServerMessage, exceptUserId: string | null = null): number {
    return this.sendWhere(message, (s) => exceptUserId === null || s.userId !== exceptUserId);
  }

  sendToUser(userId: string, message: ServerMessage): number {
    return this.sendWhere(message, (s) => s.userId === userId);
  }

  // A socket that missed the previous ping is gone (sleeping laptop, dropped Wi-Fi): close it.
  heartbeat(): void {
    for (const [socket, state] of this.clients) {
      if (!state.alive) {
        socket.terminate();
        this.clients.delete(socket);
        continue;
      }
      state.alive = false;
      socket.ping();
    }
  }

  private sendWhere(message: ServerMessage, include: (state: ClientState) => boolean): number {
    const data = JSON.stringify(message);
    let sent = 0;
    for (const [socket, state] of this.clients) {
      if (socket.readyState === OPEN && include(state)) {
        socket.send(data);
        sent++;
      }
    }
    return sent;
  }
}
