"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";

const navItems = [
  { href: "/",            label: "대시보드", icon: "⬛" },
  { href: "/motors",      label: "모터",     icon: "⚙️" },
  { href: "/alarms",      label: "알람",     icon: "🔔" },
  { href: "/maintenance", label: "정비",     icon: "🔧" },
  { href: "/reports",     label: "보고서",   icon: "📄" },
  { href: "/settings",    label: "설정",     icon: "⚙" },
];

export default function MobileNav() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className={`md:hidden fixed top-0 inset-x-0 z-50 ${isDark ? "bg-[#0f172a] border-b border-slate-800" : "bg-white border-b border-slate-200"}`}>
      {/* 타이틀 바 */}
      <div className={`flex items-center justify-between px-4 h-10 ${isDark ? "border-b border-slate-800/60" : "border-b border-slate-100"}`}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center text-white font-black text-[10px]"
            style={{ background: "linear-gradient(135deg,#06b6d4,#3b82f6)" }}>M</div>
          <span className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>MOTOR-IQ</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggle} title={isDark ? "라이트 모드" : "다크 모드"}
            className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors
              ${isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700"}`}>
            {isDark ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="w-4 h-4">
                <circle cx="12" cy="12" r="4"/>
                <line x1="12" y1="2"  x2="12" y2="4"/>
                <line x1="12" y1="20" x2="12" y2="22"/>
                <line x1="4.22" y1="4.22"  x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="2"  y1="12" x2="4"  y2="12"/>
                <line x1="20" y1="12" x2="22" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="w-4 h-4">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
          <span className={`text-[10px] ${isDark ? "text-slate-600" : "text-slate-400"}`}>FA-IT Solution</span>
        </div>
      </div>
      {/* 탭 네비게이션 */}
      <div className="flex overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-4 py-2 text-[10px] font-medium transition-colors border-b-2 ${
                isActive
                  ? isDark ? "text-cyan-400 border-cyan-400" : "text-indigo-600 border-indigo-600"
                  : isDark ? "text-slate-400 border-transparent" : "text-slate-400 border-transparent"
              }`}
            >
              <span className="text-sm leading-none">{item.icon}</span>
              <span className="leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
