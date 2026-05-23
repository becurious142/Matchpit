import { Response } from "express";
import { config as runtimeConfig } from "../config/runtime";
import { logger } from "./logger";
import { randomUUID } from "crypto";

interface SSEClient {
  id: string;
  userId: string;
  ip: string;
  res: Response;
  channels: Set<string>;
  connectedAt: number;
  lastHeartbeat: number;
}

export class SSEManager {
  private clients: Map<string, SSEClient> = new Map();
  // Map of userId to Set of clientIds
  private userConnections: Map<string, Set<string>> = new Map();
  // Map of IP to Set of clientIds
  private ipConnections: Map<string, Set<string>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private pruneInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
    this.startPruner();
  }

  public addClient(userId: string, res: Response, channels: string[], ip: string = "unknown"): SSEClient {
    const clientId = randomUUID();
    
    // Check connection limit per user
    let userClients = this.userConnections.get(userId);
    if (!userClients) {
      userClients = new Set();
      this.userConnections.set(userId, userClients);
    }

    if (userClients.size >= runtimeConfig.sse.maxConnectionsPerUser) {
      // Find oldest connection and kill it
      let oldestClient: SSEClient | null = null;
      for (const cid of userClients) {
        const client = this.clients.get(cid);
        if (client && (!oldestClient || client.connectedAt < oldestClient.connectedAt)) {
          oldestClient = client;
        }
      }
      
      if (oldestClient) {
        this.sendToClient(oldestClient, "disconnect", { reason: "connection_limit_exceeded" });
        this.removeClient(oldestClient.id);
      }
    }

    // Check connection limit per IP
    let ipClients = this.ipConnections.get(ip);
    if (!ipClients) {
      ipClients = new Set();
      this.ipConnections.set(ip, ipClients);
    }
    
    if (ipClients.size >= runtimeConfig.sse.maxConnectionsPerIp) {
      logger.warn({ ip, userId }, "IP SSE connection limit exceeded, rejecting new connection");
      res.status(429).json({ error: "Too many connections from this IP" });
      res.end();
      throw new Error("IP connection limit exceeded");
    }

    const client: SSEClient = {
      id: clientId,
      userId,
      ip,
      res,
      channels: new Set(channels),
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    this.clients.set(clientId, client);
    userClients.add(clientId);
    ipClients.add(clientId);

    logger.debug({ userId, clientId, channels, ip }, "SSE client connected");

    // Force reconnect after 10 mins (auth refresh)
    setTimeout(() => {
      if (this.clients.has(clientId)) {
        this.sendToClient(client, "reconnect", { reason: "auth_refresh" });
        this.removeClient(clientId);
      }
    }, 10 * 60 * 1000);

    return client;
  }

  public removeClient(clientId: string) {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      client.res.end();
    } catch (err) {}

    this.clients.delete(clientId);
    const userClients = this.userConnections.get(client.userId);
    if (userClients) {
      userClients.delete(clientId);
      if (userClients.size === 0) {
        this.userConnections.delete(client.userId);
      }
    }

    const ipClients = this.ipConnections.get(client.ip);
    if (ipClients) {
      ipClients.delete(clientId);
      if (ipClients.size === 0) {
        this.ipConnections.delete(client.ip);
      }
    }

    logger.debug({ clientId, ip: client.ip }, "SSE client removed");
  }

  public broadcast(channel: string, eventType: string, data: any) {
    for (const client of this.clients.values()) {
      if (client.channels.has(channel)) {
        this.sendToClient(client, eventType, data);
      }
    }
  }

  public getConnectionCount(): number {
    return this.clients.size;
  }

  private sendToClient(client: SSEClient, eventType: string, data: any) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    
    // Backpressure protection
    const ok = client.res.write(payload);
    if (!ok) {
      logger.warn({ clientId: client.id }, "SSE backpressure hit, disconnecting slow consumer");
      this.removeClient(client.id);
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const client of this.clients.values()) {
        this.sendToClient(client, "heartbeat", { ts: now });
        client.lastHeartbeat = now;
      }
    }, runtimeConfig.sse.heartbeatIntervalMs);
  }

  private startPruner() {
    // Prune stale or dead connections every 60s
    this.pruneInterval = setInterval(() => {
      const now = Date.now();
      for (const client of this.clients.values()) {
        // If a client hasn't received a heartbeat successfully (or connection hung)
        if (now - client.lastHeartbeat > runtimeConfig.sse.connectionTimeoutMs) {
          logger.warn({ clientId: client.id }, "Pruning stale SSE connection");
          this.removeClient(client.id);
        }
      }
    }, 60000);
  }

  public closeAll() {
    logger.info("Closing all SSE connections for graceful shutdown");
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.pruneInterval) clearInterval(this.pruneInterval);
    
    for (const client of this.clients.values()) {
      try {
        this.sendToClient(client, "disconnect", { reason: "server_shutdown" });
        client.res.end();
      } catch (err) {}
    }
    this.clients.clear();
    this.userConnections.clear();
  }
}

export const sseManager = new SSEManager();
