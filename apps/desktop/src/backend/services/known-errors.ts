import type { KnownErrorGuidance } from "@roller-rumble/shared/types";

/**
 * The known-error catalog: a pure mapping from a recognized subsystem failure to plain-language
 * operator guidance and a suggested next action (see CONTEXT.md "known-error catalog"). It is
 * seeded only with failures we have actually observed and is expected to grow. Unrecognized
 * failures return `null`, and callers fall back to surfacing the raw error plus the
 * diagnostics-bundle path.
 */
interface CatalogEntry extends KnownErrorGuidance {
  match: RegExp;
}

const CATALOG: readonly CatalogEntry[] = [
  {
    code: "tunnel_token_rejected",
    match:
      /tunnel token is not valid|invalid tunnel token|token.*not valid|401 unauthorized|failed to (parse|get) tunnel/i,
    explanation: "Cloudflare rejected the tunnel token, so the stable public URL cannot start.",
    nextAction:
      "Re-copy the connector token from your Cloudflare tunnel (Tunnels → your tunnel → Configure → Token) and paste it into the Tunnel token field again, then restart the tunnel."
  },
  {
    code: "cloudflared_binary_missing",
    match:
      /cloudflared.*(not found|missing|could not be found|is not installed)|binary.*not found/i,
    explanation: "The cloudflared program that runs the tunnel is not installed.",
    nextAction:
      'Click "Install cloudflared" in the Tunnel panel, then try starting the tunnel again.'
  },
  {
    code: "stripe_tls_cert",
    match:
      /self.signed|unable to (get|verify)|certificate|\bTLS\b|\bSSL\b|could not reach stripe|stripe_ca_file_unreadable/i,
    explanation:
      "Roller Rumble could not establish a secure connection to Stripe. This usually means HTTPS inspection (Zscaler, a corporate VPN) is in the way.",
    nextAction:
      "Export your organization's trusted root certificate as a PEM file and paste its full path into the Stripe CA certificate file field."
  },
  {
    code: "stripe_invalid_key",
    match: /invalid api key|no such|authentication.*stripe|invalid.*secret key|api key provided/i,
    explanation: "Stripe rejected the secret key.",
    nextAction:
      "Copy the secret key again from your Stripe dashboard (Developers → API keys) and paste it into the Stripe secret key field. Make sure you are using the right test/live mode."
  },
  {
    code: "env_file_not_loaded",
    match: /env file.*not.*load|no \.env|runtime env.*not loaded|settings file.*not.*load/i,
    explanation: "The settings file could not be read, so saved settings are not being applied.",
    nextAction:
      'Use "Reload settings from disk" in Settings, or restart Roller Rumble. If it persists, save the diagnostics bundle and send it to the maintainer.'
  },
  {
    code: "port_in_use",
    match: /EADDRINUSE|address already in use|port.*(already )?in use/i,
    explanation: "Another program is already using the port Roller Rumble needs.",
    nextAction:
      "Quit any other copy of Roller Rumble (or the program using the port) and relaunch. A full restart usually clears this."
  }
];

export function lookupKnownError(rawError: string | null | undefined): KnownErrorGuidance | null {
  if (!rawError) {
    return null;
  }

  for (const entry of CATALOG) {
    if (entry.match.test(rawError)) {
      return { code: entry.code, explanation: entry.explanation, nextAction: entry.nextAction };
    }
  }

  return null;
}
