import { worldStatus } from "../src/features/world/service";
import { sqlite } from "../src/server/db";
console.log(
  JSON.stringify(
    {
      ...worldStatus(),
      challenges: (
        sqlite
          .prepare(
            "SELECT data FROM world_challenges ORDER BY rowid DESC LIMIT 20",
          )
          .all() as { data: string }[]
      ).map(({ data }) => {
        const c = JSON.parse(data);
        return {
          id: c.id,
          purpose: c.purpose,
          status: c.status,
          environment: c.environment,
          expiresAt: new Date(c.rpContext.expires_at * 1000).toISOString(),
          verifiedAt: c.verifiedAt,
          rule: c.policy?.conditions.id,
          version: c.policy ? c.policy.baseVersion + 1 : undefined,
        };
      }),
      acceptedProofs: (
        sqlite.prepare("SELECT count(*) AS n FROM world_used_proofs").get() as {
          n: number;
        }
      ).n,
    },
    null,
    2,
  ),
);
