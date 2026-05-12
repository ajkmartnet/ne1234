import { Router } from "express";
import { db } from "@workspace/db";
import { savedAddressesTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { sendSuccess, sendNotFound, sendError } from "../../lib/response.js";
import { requirePermission } from "../../middleware/require-permission.js";

const router = Router();

router.get("/users/:id/addresses", requirePermission("users.view"), async (req, res) => {
  try {
    const userId = req.params["id"]!;
    const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { sendNotFound(res, "User not found"); return; }

    const addresses = await db
      .select()
      .from(savedAddressesTable)
      .where(eq(savedAddressesTable.userId, userId));

    sendSuccess(res, { addresses });
  } catch (err) {
    sendError(res, "Internal server error", 500);
  }
});

export default router;
