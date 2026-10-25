import { mkdirSync, openSync, closeSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  issueAgentCredential,
  issueEnrollmentTicket,
  revokeCredential,
} from "../src/server/auth";
process.env.BANK_BIND_HOST = "127.0.0.1";
const [command, arg] = process.argv.slice(2);
if (command === "revoke" && arg) {
  revokeCredential(arg);
  console.log("Credential revoked");
} else if (command === "agent" || command === "enroll") {
  const path =
    arg ??
    (command === "agent"
      ? ".data/agent-credential"
      : ".data/enrollment-ticket");
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "wx", 0o600);
  try {
    const value =
      command === "agent"
        ? issueAgentCredential()
        : { token: issueEnrollmentTicket() };
    writeFileSync(fd, value.token);
    console.log("Secret saved to protected file", path);
    if ("credentialId" in value)
      console.log("Credential ID", value.credentialId);
  } finally {
    closeSync(fd);
  }
} else
  throw new Error(
    "Usage: auth agent|enroll [new-file] or auth revoke <credential-id>",
  );
