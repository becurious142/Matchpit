import { db } from "@workspace/db";
import { notificationsTable, type InsertNotification } from "@workspace/db";

export async function createNotification(data: InsertNotification) {
  const [notification] = await db
    .insert(notificationsTable)
    .values(data)
    .returning();
  return notification;
}
