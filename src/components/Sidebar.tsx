"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "대시보드", icon: "⬛" },
  { href: "/motors", label: "모터 목록", icon: "⚙️" },
  { href: "/alarms", label: "알람 이력", icon: "🔔" },
  { href: "/maintenance", label: "정비 이력", icon: "🔧" },
  { href: "/reports", label: "보고서", icon: "📄" },
  { href: "/settings", label: "설정", icon: "⚙" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 min-h-screen bg-slate-900 text-white flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-700">
        <p className="text-xs text-slate-400 font-medium tracking-widest uppercase">FA-IT Solution</p>
        <h1 className="text-xl font-bold text-white mt-0.5">MOTOR-IQ</h1>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-700">
        <p className="text-xs text-slate-500">v0.1.0 · QM30VT3</p>
      </div>
    </aside>
  );
}
