export default function SettingsPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-4xl font-bold text-[#003527] tracking-tight">Settings</h2>
        <p className="text-base text-slate-500 mt-1">Manage organisation-wide configuration.</p>
      </div>

      <div className="space-y-6">
        {/* Organisation */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h4 className="text-base font-semibold text-[#003527]">Organisation</h4>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Company Name</label>
                <input defaultValue="Our World Energy" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">System Label</label>
                <input defaultValue="Contractor Management System" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Default Timezone</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all">
                  <option>UTC−5 (Eastern Time)</option>
                  <option>UTC+5:30 (India)</option>
                  <option>UTC−6 (Central Time)</option>
                  <option>UTC+8 (Philippines)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Fiscal Year Start</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all">
                  <option>January</option>
                  <option>April</option>
                  <option>July</option>
                  <option>October</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* Payroll */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h4 className="text-base font-semibold text-[#003527]">Payroll</h4>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Pay Cycle</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all">
                  <option>Bi-weekly (every 2 weeks)</option>
                  <option>Monthly</option>
                  <option>Weekly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Default Tax Rate (%)</label>
                <input type="number" defaultValue={15} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all" />
              </div>
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h4 className="text-base font-semibold text-[#003527]">Notifications</h4>
          </div>
          <div className="px-6 py-5 space-y-3">
            {[
              "Email alerts for certification expiry",
              "Notify admin on new leave requests",
              "Weekly payroll summary digest",
              "Absence alerts (same-day)",
            ].map((label) => (
              <label key={label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0 cursor-pointer">
                <span className="text-sm text-slate-700">{label}</span>
                <div className="relative">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-10 h-5 bg-slate-200 peer-checked:bg-teal-500 rounded-full transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-all peer-checked:translate-x-5" />
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Save */}
        <div className="flex justify-end">
          <button className="bg-[#003527] hover:bg-[#064e3b] text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors shadow-sm">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
