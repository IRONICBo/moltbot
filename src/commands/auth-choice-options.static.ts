import { resolveLegacyAuthChoiceAliasesForCli } from "./auth-choice-legacy.js";
import type { AuthChoice, AuthChoiceGroupId } from "./onboard-types.js";

export type { AuthChoiceGroupId };

export type AuthChoiceOption = {
  value: AuthChoice;
  label: string;
  hint?: string;
  groupId?: AuthChoiceGroupId;
  groupLabel?: string;
  groupHint?: string;
};

export type AuthChoiceGroup = {
  value: AuthChoiceGroupId;
  label: string;
  hint?: string;
  options: AuthChoiceOption[];
};

export const CORE_AUTH_CHOICE_OPTIONS: ReadonlyArray<AuthChoiceOption> = [
  {
    value: "wanqing-api-key",
    label: "WanQing (Internal Kuaishou AI Gateway)",
    hint: "Use WanQing API key for Kuaishou internal models",
    groupId: "wanqing",
    groupLabel: "WanQing",
    groupHint: "Internal Kuaishou AI Gateway",
  },
  {
    value: "kwaicli-api-key",
    label: "KwaiCLI (Codex + Claude Code style)",
    hint: "Use KwaiCLI for local AI code assistant",
    groupId: "kwaicli",
    groupLabel: "KwaiCLI",
    groupHint: "Kuaishou CLI code assistant",
  },
  {
    value: "custom-api-key",
    label: "Custom Provider",
    hint: "Any OpenAI or Anthropic compatible endpoint",
    groupId: "custom",
    groupLabel: "Custom Provider",
    groupHint: "Any OpenAI or Anthropic compatible endpoint",
  },
];

export function formatStaticAuthChoiceChoicesForCli(params?: {
  includeSkip?: boolean;
  includeLegacyAliases?: boolean;
  config?: import("../config/config.js").OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const includeSkip = params?.includeSkip ?? true;
  const includeLegacyAliases = params?.includeLegacyAliases ?? false;
  const values = CORE_AUTH_CHOICE_OPTIONS.map((opt) => opt.value);

  if (includeSkip) {
    values.push("skip");
  }
  if (includeLegacyAliases) {
    values.push(...resolveLegacyAuthChoiceAliasesForCli(params));
  }

  return values.join("|");
}
