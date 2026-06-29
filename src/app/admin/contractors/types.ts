export type Contractor = {
  uid: string;
  firstName: string;
  middleName: string;
  surname: string;
  fullName: string;
  avatar: string;
  dob: string;
  gender: string;
  contractorId: string;
  department: string;
  subDepartment: string;
  role: string;
  location: string;
  status: "Active" | "Dismissed";
  hireDate: string;
  officeLocation: string;
  currency: string;
  monthlyRate: string;
  weeklyRate: string;
  hourlyRate: string;
  email: string;
  payCategory: string;
  shiftHours: string;
  restDay: string;
  manager: string;
  payPeriod: string;
  shiftType: string;
  createdOn: string;
  dismissalDate: string;
  dismissalReason: string;
  equipmentProvided: boolean;
  worksnapId: string;
  ptoUsed: number;
  sickLeaveUsed: number;
  birthdayLeave: number;
  advanceSickLeave: number;
};

export type ColumnDef = {
  key: keyof Contractor;
  label: string;
  type: "string" | "date" | "number";
};

export const COLUMNS: ColumnDef[] = [
  { key: "uid",            label: "Unique ID",       type: "string" },
  { key: "firstName",      label: "First Name",      type: "string" },
  { key: "middleName",     label: "Middle Name",     type: "string" },
  { key: "surname",        label: "Surname",         type: "string" },
  { key: "fullName",       label: "Full Name",       type: "string" },
  { key: "dob",            label: "Date of Birth",   type: "date"   },
  { key: "gender",         label: "Gender",          type: "string" },
  { key: "contractorId",   label: "Contractor ID",   type: "string" },
  { key: "department",     label: "Department",      type: "string" },
  { key: "subDepartment",  label: "Sub-Department",  type: "string" },
  { key: "role",           label: "Role",            type: "string" },
  { key: "location",       label: "Location",        type: "string" },
  { key: "status",         label: "Status",          type: "string" },
  { key: "hireDate",       label: "Hire Date",       type: "date"   },
  { key: "officeLocation", label: "Office Location", type: "string" },
  { key: "currency",       label: "Currency",        type: "string" },
  { key: "monthlyRate",    label: "Monthly Rate",    type: "number" },
  { key: "weeklyRate",     label: "Weekly Rate",     type: "number" },
  { key: "hourlyRate",     label: "Hourly Rate",     type: "number" },
  { key: "email",          label: "Email",           type: "string" },
  { key: "payCategory",    label: "Pay Category",    type: "string" },
  { key: "shiftHours",     label: "Shift Hours",     type: "string" },
  { key: "restDay",        label: "Rest Day",        type: "string" },
  { key: "manager",        label: "Manager",         type: "string" },
  { key: "payPeriod",      label: "Pay Period",      type: "string" },
  { key: "createdOn",      label: "Created On",      type: "date"   },
  { key: "dismissalDate",   label: "Dismissal Date",   type: "date"   },
  { key: "dismissalReason",    label: "Dismissal Reason",    type: "string" },
  { key: "equipmentProvided", label: "Equipment Provided", type: "string" },
  { key: "worksnapId",        label: "Worksnap ID",        type: "string" },
];

export type FilterRule = {
  id: string;
  column: keyof Contractor;
  operator: string;
  value: string;
  value2?: string;
};
