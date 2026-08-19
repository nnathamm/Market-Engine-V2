import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { authorize, listAccessRecords } from "@/lib/access-control";

export async function GET() {
  const authorization = await authorize("access.manage");
  if (authorization.response) return authorization.response;

  const [client, accessRecords] = await Promise.all([clerkClient(), listAccessRecords()]);
  const result = await client.users.getUserList({ limit: 100, orderBy: "created_at" });

  return NextResponse.json({
    users: result.data.map((user) => {
      const access = accessRecords.get(user.id) ?? { role: "member", permissions: ["markets.view", "notifications.view"] };
      return {
        id: user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Unnamed user",
        email: user.primaryEmailAddress?.emailAddress ?? "No email address",
        role: access.role,
        permissions: access.permissions,
      };
    }),
  });
}