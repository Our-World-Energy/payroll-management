"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { fetchOrgConfig, seedOrgDefaults } from "@/app/admin/settings/actions";

// ── Fallback defaults (used only on first seed) ───────────────────────────────
const DEFAULT_OFFICE_LOCATIONS = [
  "PGS [AZ, Yuma]", "OWE [MA, Auburn]", "Solar Godz [FL, Jacksonville]",
  "eEquals [VA, Richmond]", "Allied Energy Solutions [ME, Brunswick]", "Adrian Martinez",
  "Allied Energy Solutions [NH, Bow]", "eEquals [IL, St Louis]",
  "Allied Energy Solutions [NJ, Pennsauken]", "OWE [AZ, Tucson]", "Va Energy Electric",
  "Solar Godz [VA, Richmond]", "Allied Energy Solutions [TX, Midland]",
  "Sunrite Solar [MA, Hudson]", "OWE [AZ, Tempe]", "Solar Godz [FL, Tallahassee]",
  "No Office", "Clear Solar Solutions [CA, Turlock]", "OWE [TX, San Antonio]",
  "OWE [AZ, Phoenix]", "OWE [TX, Austin]", "Allied Energy Solutions [RI, Providence]",
  "eEquals [MD, Jessup]", "Cody Rawleigh", "Sunforce [TX, Las Cruces]",
  "OWE [TX, El Paso]", "OWE [FL, St Peterburg]", "Integrity Electrical [AZ, Yuma]",
  "Green Volt [CA, Fresno]", "Sun Craft Contracting [FL, Flagler]", "OWE [CO, Denver]",
  "OWE [CO, Grand Junction]", "OWE [TX, Corpus Christi]", "Sunrite Solar [CT, Wallingford]",
  "OWE [AZ, Kingman]", "Sunlife Tech [PR, Guaynabo]", "Solar Godz [FL, Tampa]",
  "Solar Godz [MD, Jessup]", "Sunrite Solar [RI, Rhode Island]", "Optimum Home [TX, Houston]",
  "OWE [TX, Houston]", "Mendez Electric Solar [CA, San Jacinto]",
  "Direct Electrical Innovations [TX, Dallas]", "Allied Energy Solutions [IL, Hammond]",
  "OWE [TX, Grand Prairie]", "OWE [NM, Albuquerque]", "Adrian Ruvalcaba",
  "Allied Energy Solutions [MA, Mansfield]", "DT Solar [TX, Brownsville]",
];

export type DeptTree = Record<string, Record<string, string[]>>;

const DEFAULT_DEPT_TREE: DeptTree = {
  "Internal Operations": {
    CAD: ["Electrical Review Manager", "Electrical Review Team Lead", "Electrical Review Sr"],
    Electrical: ["Electrical 1", "Electrical 2"],
  },
  "Field Ops": {
    Construction: ["Construction Manager", "Construction Lead", "Site Supervisor"],
    Inspection:   ["Field Inspector", "Quality Inspector"],
  },
  "Solar Engineering": {
    "Field Inspection":   ["Lead Inspector", "Solar Technician"],
    "Panel Installation": ["Installation Lead", "Installer"],
    "System Design":      ["Design Engineer", "CAD Drafter"],
  },
  "Grid Maintenance": {
    "High Voltage":  ["HV Specialist", "HV Technician"],
    Distribution:    ["Grid Technician", "Maintenance Lead"],
    Substation:      ["Substation Engineer", "Protection Relay Tech"],
  },
  "Field Safety": {
    Compliance:            ["Safety Officer", "Compliance Analyst"],
    "Risk Assessment":     ["Risk Analyst", "HSE Coordinator"],
    "Emergency Response":  ["Emergency Coordinator", "First Responder"],
  },
  Logistics: {
    "Supply Chain":     ["Logistics Lead", "Supply Analyst"],
    "Offshore Support": ["Offshore Coordinator", "Logistics Specialist"],
    Warehouse:          ["Warehouse Manager", "Inventory Clerk"],
  },
};

const DEFAULT_MANAGERS = ["Colten Warnock", "Dillard Blanton"];

// ── Context type ──────────────────────────────────────────────────────────────

type ContractorConfig = {
  officeLocations: string[];
  setOfficeLocations: (v: string[]) => void;
  deptTree: DeptTree;
  setDeptTree: (v: DeptTree) => void;
  managers: string[];
  setManagers: (v: string[]) => void;
  configLoaded: boolean;
  reloadConfig: () => Promise<void>;
};

const ContractorConfigContext = createContext<ContractorConfig>({
  officeLocations: DEFAULT_OFFICE_LOCATIONS,
  setOfficeLocations: () => {},
  deptTree: DEFAULT_DEPT_TREE,
  setDeptTree: () => {},
  managers: DEFAULT_MANAGERS,
  setManagers: () => {},
  configLoaded: false,
  reloadConfig: async () => {},
});

export function ContractorConfigProvider({ children }: { children: React.ReactNode }) {
  const [officeLocations, setOfficeLocations] = useState<string[]>([]);
  const [deptTree, setDeptTree]               = useState<DeptTree>({});
  const [managers, setManagers]               = useState<string[]>([]);
  const [configLoaded, setConfigLoaded]       = useState(false);

  const reloadConfig = useCallback(async () => {
    try {
      const cfg = await fetchOrgConfig();

      // If DB is empty (first run), seed from defaults then reload
      if (cfg.officeLocations.length === 0 && cfg.managers.length === 0 && Object.keys(cfg.deptTree).length === 0) {
        await seedOrgDefaults(DEFAULT_OFFICE_LOCATIONS, DEFAULT_MANAGERS, DEFAULT_DEPT_TREE);
        const seeded = await fetchOrgConfig();
        setOfficeLocations(seeded.officeLocations);
        setManagers(seeded.managers);
        setDeptTree(seeded.deptTree);
      } else {
        setOfficeLocations(cfg.officeLocations);
        setManagers(cfg.managers);
        setDeptTree(cfg.deptTree);
      }
    } catch {
      // Fall back to hardcoded defaults if DB is unreachable
      setOfficeLocations(DEFAULT_OFFICE_LOCATIONS);
      setManagers(DEFAULT_MANAGERS);
      setDeptTree(DEFAULT_DEPT_TREE);
    }
    setConfigLoaded(true);
  }, []);

  useEffect(() => {
    reloadConfig();
  }, [reloadConfig]);

  return (
    <ContractorConfigContext.Provider value={{
      officeLocations, setOfficeLocations,
      deptTree, setDeptTree,
      managers, setManagers,
      configLoaded,
      reloadConfig,
    }}>
      {children}
    </ContractorConfigContext.Provider>
  );
}

export function useContractorConfig() {
  return useContext(ContractorConfigContext);
}
