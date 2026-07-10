export type Contractor = {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  region: "US" | "Philippines" | "Mexico" | "India";
  site: string;
  status: "Active" | "On Leave" | "Inactive";
  cert: "Certified" | "Expiring" | "Expired";
  hireDate: string;
  restDays: string[];
};

export type AttendanceRecord = {
  contractorId: string;
  name: string;
  role: string;
  avatar: string;
  region: string;
  date: string;
  checkIn: string;
  checkOut: string;
  hours: string;
  status: "Present" | "Late" | "Absent" | "On Leave";
  // Weekly tracking
  standardMinutes: number;
  actualMinutes: number;
  weeklyStatus: "Standard Met" | "For Review" | "On Leave" | "Reviewed";
};

export type TimeOffRequest = {
  id: string;
  name: string;
  region: string;
  type: "Annual Leave" | "Sick Leave" | "Unpaid Leave";
  from: string;
  to: string;
  days: number;
  reason: string;
  status: "Approved" | "Pending" | "Rejected";
};

export const CONTRACTORS: Contractor[] = [
  { id: "C001", name: "Sarah Jenkins",  email: "sarah.jenkins@example.com", department: "Field Operations", role: "Solar Technician",    region: "US",          site: "Solar Array A", status: "Active",   cert: "Certified", hireDate: "2024-03-18", restDays: ["Saturday", "Sunday"] },
  { id: "C002", name: "Michael Chen",   email: "michael.chen@example.com",  department: "Safety",           role: "Safety Officer",      region: "US",          site: "Wind Farm East",status: "Active",   cert: "Expiring",  hireDate: "2023-11-06", restDays: ["Saturday", "Sunday"] },
  { id: "C003", name: "Priya Sharma",   email: "priya.sharma@example.com",  department: "Engineering",      role: "Electrical Engineer", region: "India",       site: "Hydro Beta",    status: "Active",   cert: "Certified", hireDate: "2022-07-25", restDays: ["Sunday"] },
  { id: "C004", name: "Carlos Rivera",  email: "carlos.rivera@example.com", department: "Operations",       role: "Site Manager",        region: "Mexico",      site: "Solar Array B", status: "Active",   cert: "Certified", hireDate: "2021-09-14", restDays: ["Saturday", "Sunday"] },
  { id: "C005", name: "Ana Santos",     email: "ana.santos@example.com",    department: "Logistics",        role: "Logistics Lead",      region: "Philippines", site: "HQ Support",    status: "On Leave", cert: "Certified", hireDate: "2023-01-30", restDays: ["Saturday", "Sunday"] },
  { id: "C006", name: "James Okoye",    email: "james.okoye@example.com",   department: "Field Operations", role: "Grid Technician",     region: "US",          site: "Solar Array A", status: "Active",   cert: "Certified", hireDate: "2024-05-13", restDays: ["Saturday", "Sunday"] },
  { id: "C007", name: "Li Wei",         email: "li.wei@example.com",        department: "Analytics",        role: "Data Analyst",        region: "India",       site: "Remote",        status: "Inactive", cert: "Expired",   hireDate: "2020-10-21", restDays: ["Sunday"] },
  { id: "C008", name: "Maria Lopez",    email: "maria.lopez@example.com",   department: "Engineering",      role: "Field Engineer",      region: "Mexico",      site: "Solar Array C", status: "Active",   cert: "Certified", hireDate: "2023-06-05", restDays: ["Saturday", "Sunday"] },
  { id: "C009", name: "John Reyes",     email: "john.reyes@example.com",    department: "Field Operations", role: "Solar Technician",    region: "Philippines", site: "Solar Array D", status: "Active",   cert: "Certified", hireDate: "2024-02-12", restDays: ["Saturday", "Sunday"] },
  { id: "C010", name: "Aisha Patel",    email: "aisha.patel@example.com",   department: "Project Delivery", role: "Project Manager",     region: "India",       site: "HQ India",      status: "Active",   cert: "Certified", hireDate: "2022-04-04", restDays: ["Sunday"] },
  { id: "C011", name: "Tom Bradley",    email: "tom.bradley@example.com",   department: "Field Operations", role: "Grid Technician",     region: "US",          site: "Wind Farm East",status: "Active",   cert: "Certified", hireDate: "2023-08-28", restDays: ["Saturday", "Sunday"] },
  { id: "C012", name: "Rosa Mendez",    email: "rosa.mendez@example.com",   department: "Engineering",      role: "Field Engineer",      region: "Mexico",      site: "Solar Array B", status: "Active",   cert: "Expiring",  hireDate: "2024-01-16", restDays: ["Saturday", "Sunday"] },
];

export const ATTENDANCE: AttendanceRecord[] = [
  { contractorId: "C001", name: "Sarah Jenkins",  role: "Solar Technician",    avatar: "SJ", region: "US",          date: "2026-05-15", checkIn: "08:02", checkOut: "17:05", hours: "9h 03m", status: "Present",  standardMinutes: 2700, actualMinutes: 2400, weeklyStatus: "Standard Met"    },
  { contractorId: "C002", name: "Michael Chen",   role: "Safety Officer",      avatar: "MC", region: "US",          date: "2026-05-15", checkIn: "08:45", checkOut: "17:00", hours: "8h 15m", status: "Present",  standardMinutes: 2700, actualMinutes: 2610, weeklyStatus: "For Review"  },
  { contractorId: "C003", name: "Priya Sharma",   role: "Electrical Engineer", avatar: "PS", region: "India",       date: "2026-05-15", checkIn: "09:10", checkOut: "—",     hours: "—",      status: "Late",     standardMinutes: 2700, actualMinutes: 2180, weeklyStatus: "For Review"    },
  { contractorId: "C004", name: "Carlos Rivera",  role: "Site Manager",        avatar: "CR", region: "Mexico",      date: "2026-05-15", checkIn: "—",     checkOut: "—",     hours: "—",      status: "Absent",   standardMinutes: 2700, actualMinutes: 2400, weeklyStatus: "Standard Met"    },
  { contractorId: "C005", name: "Ana Santos",     role: "Logistics Lead",      avatar: "AS", region: "Philippines", date: "2026-05-15", checkIn: "—",     checkOut: "—",     hours: "—",      status: "On Leave", standardMinutes: 2700, actualMinutes: 0,    weeklyStatus: "On Leave"         },
  { contractorId: "C006", name: "James Okoye",    role: "Grid Technician",     avatar: "JO", region: "US",          date: "2026-05-15", checkIn: "07:58", checkOut: "17:02", hours: "9h 04m", status: "Present",  standardMinutes: 2700, actualMinutes: 2400, weeklyStatus: "Standard Met"    },
  { contractorId: "C007", name: "Li Wei",         role: "Data Analyst",        avatar: "LW", region: "India",       date: "2026-05-15", checkIn: "—",     checkOut: "—",     hours: "—",      status: "Absent",   standardMinutes: 2700, actualMinutes: 2150, weeklyStatus: "For Review"    },
  { contractorId: "C008", name: "Maria Lopez",    role: "Field Engineer",      avatar: "ML", region: "Mexico",      date: "2026-05-15", checkIn: "08:30", checkOut: "17:30", hours: "9h 00m", status: "Present",  standardMinutes: 2700, actualMinutes: 2400, weeklyStatus: "Standard Met"    },
  { contractorId: "C009", name: "John Reyes",     role: "Solar Technician",    avatar: "JR", region: "Philippines", date: "2026-05-15", checkIn: "08:15", checkOut: "17:10", hours: "8h 55m", status: "Present",  standardMinutes: 2700, actualMinutes: 2580, weeklyStatus: "For Review"  },
  { contractorId: "C010", name: "Aisha Patel",    role: "Project Manager",     avatar: "AP", region: "India",       date: "2026-05-15", checkIn: "08:50", checkOut: "17:45", hours: "8h 55m", status: "Present",  standardMinutes: 2700, actualMinutes: 2400, weeklyStatus: "Standard Met"    },
  { contractorId: "C011", name: "Tom Bradley",    role: "Grid Technician",     avatar: "TB", region: "US",          date: "2026-05-15", checkIn: "09:30", checkOut: "17:00", hours: "7h 30m", status: "Late",     standardMinutes: 2700, actualMinutes: 2220, weeklyStatus: "For Review"    },
  { contractorId: "C012", name: "Rosa Mendez",    role: "Field Engineer",      avatar: "RM", region: "Mexico",      date: "2026-05-15", checkIn: "08:05", checkOut: "17:05", hours: "9h 00m", status: "Present",  standardMinutes: 2700, actualMinutes: 2400, weeklyStatus: "Standard Met"    },
];

export const TIME_OFF: TimeOffRequest[] = [
  { id: "TO-101", name: "Sarah Jenkins",  region: "US",          type: "Annual Leave", from: "2026-05-20", to: "2026-05-22", days: 3,  reason: "Family vacation",   status: "Approved" },
  { id: "TO-102", name: "Priya Sharma",   region: "India",       type: "Sick Leave",   from: "2026-05-15", to: "2026-05-16", days: 2,  reason: "Medical appointment",status: "Approved" },
  { id: "TO-103", name: "Carlos Rivera",  region: "Mexico",      type: "Annual Leave", from: "2026-05-19", to: "2026-05-23", days: 5,  reason: "Personal travel",   status: "Pending"  },
  { id: "TO-104", name: "Ana Santos",     region: "Philippines", type: "Annual Leave", from: "2026-05-13", to: "2026-05-17", days: 5,  reason: "Holiday",           status: "Approved" },
  { id: "TO-105", name: "Li Wei",         region: "India",       type: "Unpaid Leave", from: "2026-05-10", to: "2026-05-20", days: 11, reason: "Extended absence",  status: "Rejected" },
  { id: "TO-106", name: "James Okoye",    region: "US",          type: "Sick Leave",   from: "2026-05-18", to: "2026-05-18", days: 1,  reason: "Unwell",            status: "Pending"  },
  { id: "TO-107", name: "John Reyes",     region: "Philippines", type: "Annual Leave", from: "2026-05-25", to: "2026-05-26", days: 2,  reason: "Rest day",          status: "Pending"  },
  { id: "TO-108", name: "Rosa Mendez",    region: "Mexico",      type: "Sick Leave",   from: "2026-05-14", to: "2026-05-14", days: 1,  reason: "Fever",             status: "Approved" },
  { id: "TO-109", name: "Tom Bradley",    region: "US",          type: "Annual Leave", from: "2026-05-22", to: "2026-05-22", days: 1,  reason: "Personal errand",   status: "Approved" },
  { id: "TO-110", name: "Aisha Patel",    region: "India",       type: "Sick Leave",   from: "2026-05-16", to: "2026-05-16", days: 1,  reason: "Not feeling well",  status: "Approved" },
  { id: "TO-111", name: "Michael Chen",   region: "US",          type: "Annual Leave", from: "2026-05-28", to: "2026-05-29", days: 2,  reason: "Weekend trip",      status: "Pending"  },
  { id: "TO-112", name: "Maria Lopez",    region: "Mexico",      type: "Annual Leave", from: "2026-05-30", to: "2026-05-30", days: 1,  reason: "Public holiday",    status: "Approved" },
];

// ── Derived metrics (single source of truth for the dashboard) ──────────────

export function getDashboardMetrics() {
  const byRegion = (r: string) => CONTRACTORS.filter((c) => c.region === r).length;

  const ptoToday    = ATTENDANCE.filter((a) => a.status === "On Leave").length;
  const absentToday = ATTENDANCE.filter((a) => a.status === "Absent").length;

  return {
    totalActive:  CONTRACTORS.length,
    us:           byRegion("US"),
    philippines:  byRegion("Philippines"),
    mexico:       byRegion("Mexico"),
    india:        byRegion("India"),
    guatemala:    byRegion("Guatemala"),
    ptoToday,
    absentToday,
  };
}
