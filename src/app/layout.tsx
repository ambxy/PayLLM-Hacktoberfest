import "./style.css";
import { BankShell } from "./bank-shell";
export const metadata = {
  title: "Agent Bank — Local demo",
  description: "You set the terms. Your agent handles the banking.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <BankShell>{children}</BankShell>
      </body>
    </html>
  );
}
