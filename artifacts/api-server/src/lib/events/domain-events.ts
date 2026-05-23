import { randomUUID } from "crypto";

export type DomainEventType = 
  | "MATCH_CREATED"
  | "MATCH_UPDATED"
  | "MATCH_CANCELLED"
  | "PLAYER_JOINED"
  | "PLAYER_LEFT"
  | "MATCH_FULL"
  | "MATCH_UNDERFILLED"
  | "PAYOUT_HELD"
  | "RISK_FLAGGED"
  | "VENUE_APPROVED"
  | "VENUE_SUSPENDED";

export interface DomainEvent<T = any> {
  eventId: string;
  eventType: DomainEventType;
  aggregateId: string;
  aggregateType: string;
  payload: T;
  emittedAt: string; // ISO string
}

export function createDomainEvent<T>(
  eventType: DomainEventType,
  aggregateId: string,
  aggregateType: string,
  payload: T
): DomainEvent<T> {
  return {
    eventId: randomUUID(),
    eventType,
    aggregateId,
    aggregateType,
    payload,
    emittedAt: new Date().toISOString(),
  };
}
