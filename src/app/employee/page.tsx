import { LogoutButton } from "@/components/auth/logout-button";
import { getStoreSecurityContext } from "@/lib/security/get-store-security-context";

export default async function EmployeePage() {
  const securityContext =
    await getStoreSecurityContext();

  return (
    <main>
      <h1>Store Protected Area</h1>

      <p>
        Store session verified successfully.
      </p>

      <p>
        Employee identity has not been
        established yet.
      </p>

      <pre>
        {JSON.stringify(
          securityContext,
          null,
          2,
        )}
      </pre>

      <LogoutButton target="store" />
    </main>
  );
}