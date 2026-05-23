import { db } from "@workspace/db";
import { citiesTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";

export class AdminCityService {
  async getCities() {
    return db
      .select()
      .from(citiesTable)
      .orderBy(asc(citiesTable.launchPriority));
  }

  async createCity(cityName: string, slug: string, isActive?: boolean, launchPriority?: number) {
    const [city] = await db
      .insert(citiesTable)
      .values({
        cityName,
        slug: slug.toLowerCase(),
        isActive: isActive ?? false,
        launchPriority: launchPriority ?? 99,
      })
      .returning();
    return city;
  }

  async updateCity(cityId: string, updates: { isActive?: boolean; launchPriority?: number; cityName?: string }) {
    const [updated] = await db
      .update(citiesTable)
      .set(updates)
      .where(eq(citiesTable.id, cityId))
      .returning();
    return updated;
  }
}

export const adminCityService = new AdminCityService();
