import * as vscode from "vscode";
import {
  resolveLanguage,
  translate,
  type AppLanguage,
  type LanguagePreference,
  type TranslationValues
} from "../shared/i18n";

export function getLanguagePreference(): LanguagePreference {
  const configured = vscode.workspace
    .getConfiguration("gitWorkspacePro")
    .get<LanguagePreference>("language", "auto");
  return ["auto", "vi", "en", "zh-cn"].includes(configured) ? configured : "auto";
}

export function getActiveLanguage(): AppLanguage {
  return resolveLanguage(getLanguagePreference(), vscode.env.language);
}

export function t(message: string, values?: TranslationValues): string {
  return translate(getActiveLanguage(), message, values);
}

export function webviewTranslations(messages: readonly string[]): Record<string, string> {
  return Object.fromEntries(messages.map((message) => [message, t(message)]));
}
