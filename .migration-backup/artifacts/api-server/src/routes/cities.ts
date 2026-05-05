import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { citiesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/cities", async (_req, res) => {
  try {
    const cities = await db
      .select()
      .from(citiesTable)
      .where(eq(citiesTable.isActive, true))
      .orderBy(asc(citiesTable.launchPriority));

    res.json(
      cities.map((c) => ({
        id: c.id,
        cityName: c.cityName,
        slug: c.slug,
        isActive: c.isActive,
        launchPriority: c.launchPriority,
      })),
    );
  } catch (err) {
    res.status(500).json({ error: "internal_error", message: "Failed to fetch cities" });
  }
});

export default router;
