import "server-only";
import { readFileSync } from "node:fs";
import { get } from "../../server/records";
import type { Mail } from "../../shared/domain";
export function readMail() {
  const grant = get<{ enabled: boolean; scope: string[] }>(
    "mail_access_grants",
    "samples",
  );
  if (!grant?.enabled) throw new Error("Mail permission required");
  return (
    JSON.parse(readFileSync("fixtures/mail.json", "utf8")) as Mail[]
  ).filter((mail) => grant.scope.includes(mail.id));
}
