"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/",            label: "대시보드",  icon: "⬛" },
  { href: "/motors",      label: "모터 목록", icon: "⚙️" },
  { href: "/alarms",      label: "알람 이력", icon: "🔔" },
  { href: "/maintenance", label: "정비 이력", icon: "🔧" },
  { href: "/reports",     label: "보고서",    icon: "📄" },
  { href: "/settings",    label: "설정",      icon: "⚙" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    // md 미만: hidden / md~lg: 아이콘 전용(w-14) / lg 이상: 전체(w-60)
    <aside className="hidden md:flex md:w-14 lg:w-60 min-h-screen bg-slate-900 text-white flex-col shrink-0 transition-[width] duration-200">
      {/* Logo */}
      <div className="h-14 flex items-center justify-center lg:justify-start lg:px-5 border-b border-slate-700 shrink-0">
        {/* 아이콘 모드 (md) */}
        <span className="lg:hidden text-lg font-black text-white select-none">M</span>
        {/* 풀 모드 (lg+) */}
        <div className="hidden lg:block overflow-hidden">
          <p className="text-[10px] text-slate-400 font-medium tracking-widest uppercase leading-none">
            FA-IT Solution
          </p>
          <h1 className="text-lg font-bold text-white mt-0.5 leading-none">MOTOR-IQ</h1>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-colors
                px-2 lg:px-3 py-2.5
                ${isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
            >
              <span className="text-base shrink-0">{item.icon}</span>
              <span className="hidden lg:inline truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 lg:px-5 py-3 border-t border-slate-700 shrink-0">
        <p className="hidden lg:block text-xs text-slate-500">v0.1.0 · QM30VT3</p>
      </div>
    </aside>
  );
}
