import { Router } from "express";
import { discoveryRoutes } from "../../../domains/discovery/discovery.routes";
import { profileRoutes } from "../../../domains/profile/profile.routes";
import { realtimeRoutes } from "./realtime.routes";

const v1Router = Router();

v1Router.use("/discovery", discoveryRoutes);
v1Router.use("/profile", profileRoutes);
v1Router.use("/realtime", realtimeRoutes);

export { v1Router };
