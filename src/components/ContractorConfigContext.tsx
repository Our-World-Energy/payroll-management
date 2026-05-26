"use client";

import { createContext, useContext, useState } from "react";

// ── Default office locations ──────────────────────────────────────────────────
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

// ── Default dept → sub → roles tree ──────────────────────────────────────────
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

type ContractorConfig = {
  officeLocations: string[];
  setOfficeLocations: (v: string[]) => void;
  deptTree: DeptTree;
  setDeptTree: (v: DeptTree) => void;
};

const ContractorConfigContext = createContext<ContractorConfig>({
  officeLocations: DEFAULT_OFFICE_LOCATIONS,
  setOfficeLocations: () => {},
  deptTree: DEFAULT_DEPT_TREE,
  setDeptTree: () => {},
});

export function ContractorConfigProvider({ children }: { children: React.ReactNode }) {
  const [officeLocations, setOfficeLocations] = useState<string[]>(DEFAULT_OFFICE_LOCATIONS);
  const [deptTree, setDeptTree]               = useState<DeptTree>(DEFAULT_DEPT_TREE);

  return (
    <ContractorConfigContext.Provider value={{ officeLocations, setOfficeLocations, deptTree, setDeptTree }}>
      {children}
    </ContractorConfigContext.Provider>
  );
}

export function useContractorConfig() {
  return useContext(ContractorConfigContext);
}
