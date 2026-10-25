import type { Rule } from "@/shared/domain";
import { assertRuleApproval } from "@/features/world/service";
import { all } from "@/server/records";
import { change } from "@/features/rules/service";
import { checkRequest, failure } from "@/server/http";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    checkRequest(req);
    return Response.json(
      all<Rule>("rules").map((rule) => {
        let status = rule.enabled ? "active" : "stopped";
        let investmentTarget = null;
        if (rule.enabled) {
          try {
            const target = assertRuleApproval(rule);
            if (rule.id === "investment") investmentTarget = target.investment;
          } catch {
            status = "reapproval-required";
          }
        }
        return {
          ...rule,
          // Older demo rules predate approval-date recording and started at the fixture clock.
          approvedDemoDate: rule.approvedDemoDate ?? "2026-09-27T00:00:00.000Z",
          status,
          investmentTarget,
        };
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(req: Request) {
  try {
    checkRequest(req);
    return Response.json(await change(await req.json()));
  } catch (e) {
    return failure(e);
  }
}
