"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_MODULES_ENABLED,
  filterNavByModules,
  normalizeModulesEnabled,
  type ModulesEnabled,
} from "@/lib/module-settings";
import {
  DEFAULT_INTEGRATION_MODULES,
  normalizeIntegrationModules,
  type IntegrationModulesEnabled,
} from "@/lib/integration-modules";
import type { NavItem } from "@/lib/navigation";

type ModuleSettingsContextValue = {
  modules: ModulesEnabled;
  integrationModules: IntegrationModulesEnabled;
  trendyolAutoSyncIntervalMinutes: number;
  ready: boolean;
  refresh: () => Promise<void>;
  filterNav: <T extends NavItem>(items: T[]) => T[];
};

const ModuleSettingsContext = createContext<ModuleSettingsContextValue>({
  modules: DEFAULT_MODULES_ENABLED,
  integrationModules: DEFAULT_INTEGRATION_MODULES,
  trendyolAutoSyncIntervalMinutes: 2,
  ready: false,
  refresh: async () => {},
  filterNav: (items) => items,
});

export function ModuleSettingsProvider({ children }: { children: ReactNode }) {
  const [modules, setModules] = useState<ModulesEnabled>(DEFAULT_MODULES_ENABLED);
  const [integrationModules, setIntegrationModules] =
    useState<IntegrationModulesEnabled>(DEFAULT_INTEGRATION_MODULES);
  const [trendyolAutoSyncIntervalMinutes, setTrendyolAutoSyncIntervalMinutes] = useState(2);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/settings?t=" + Date.now(), { cache: "no-store" });
      const data = await res.json();
      if (data.success && data.settings) {
        const s = data.settings as Record<string, unknown>;
        setModules(normalizeModulesEnabled(s.modulesEnabled));
        setIntegrationModules(normalizeIntegrationModules(s.integrationModulesEnabled));
        const interval = Number(s.trendyolAutoSyncIntervalMinutes);
        setTrendyolAutoSyncIntervalMinutes(
          Number.isFinite(interval) && interval >= 1 ? interval : 2
        );
      }
    } catch {
      /* varsayılan modüller */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onSettings = () => void refresh();
    window.addEventListener("erp-settings-updated", onSettings);
    return () => window.removeEventListener("erp-settings-updated", onSettings);
  }, [refresh]);

  const value = useMemo<ModuleSettingsContextValue>(
    () => ({
      modules,
      integrationModules,
      trendyolAutoSyncIntervalMinutes,
      ready,
      refresh,
      filterNav: (items) => filterNavByModules(items, modules),
    }),
    [modules, integrationModules, trendyolAutoSyncIntervalMinutes, ready, refresh]
  );

  return (
    <ModuleSettingsContext.Provider value={value}>{children}</ModuleSettingsContext.Provider>
  );
}

export function useModuleSettings() {
  return useContext(ModuleSettingsContext);
}
