"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";

const navItems = [
  { href: "/",            label: "대시보드",  icon: "⬛" },
  { href: "/motors",      label: "모터 목록", icon: "⚙️" },
  { href: "/alarms",      label: "알람 이력", icon: "🔔" },
  { href: "/maintenance", label: "정비 이력", icon: "🔧" },
  { href: "/reports",     label: "보고서",    icon: "📄" },
  { href: "/settings",    label: "설정",      icon: "⚙" },
];

export default function Sidebar() {
  const pathname  = usePathname();
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <aside className={`
      hidden md:flex md:w-14 lg:w-60 h-screen sticky top-0 flex-col shrink-0 transition-all duration-200
      ${isDark
        ? "bg-[#0f172a] border-r border-slate-800 text-slate-300"
        : "bg-white border-r border-slate-200 text-slate-600"
      }
    `}>
      {/* Logo */}
      <div className={`pt-8 pb-5 flex items-center justify-center lg:justify-start lg:px-5 shrink-0
        ${isDark ? "border-b border-slate-800" : "border-b border-slate-100"}`}>
        {/* 아이콘 모드 (md) */}
        <div className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm text-white"
          style={{ background: "linear-gradient(135deg, #06b6d4, #3b82f6)" }}>
          M
        </div>
        {/* 풀 모드 (lg+) */}
        <div className="hidden lg:flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-base text-white shrink-0"
            style={{ background: "linear-gradient(135deg, #06b6d4, #3b82f6)", boxShadow: "0 0 16px rgba(6,182,212,0.35)" }}>
            M
          </div>
          <div>
            <p className={`text-[10px] font-medium tracking-widest uppercase leading-none
              ${isDark ? "text-slate-500" : "text-slate-400"}`}>
              FA-IT Solution
            </p>
            <h1 className={`text-[15px] font-bold mt-0.5 leading-none
              ${isDark ? "text-white" : "text-slate-900"}`}>
              MOTOR-IQ
            </h1>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 pt-4 pb-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-all
                px-2 lg:px-3 py-2.5
                ${isActive
                  ? isDark
                    ? "bg-sky-950/80 text-cyan-400 border border-sky-800/50"
                    : "bg-indigo-50 text-indigo-600 border border-indigo-100"
                  : isDark
                    ? "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                }`}
            >
              <span className="text-base shrink-0">{item.icon}</span>
              <span className="hidden lg:inline truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer — 테마 토글 */}
      <div className={`px-2 lg:px-3 py-3 shrink-0 ${isDark ? "border-t border-slate-800" : "border-t border-slate-100"}`}>
        <button
          onClick={toggle}
          title={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
          className={`w-full flex items-center gap-3 px-2 lg:px-3 py-2 rounded-lg text-sm font-medium transition-all
            ${isDark
              ? "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            }`}
        >
          {/* 아이콘 — 항상 표시 */}
          <span className="shrink-0 w-[18px] h-[18px] flex items-center justify-center">
            {isDark ? (
              // 태양 아이콘
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="w-[18px] h-[18px]">
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
              // 달 아이콘
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="w-[18px] h-[18px]">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </span>
          {/* 텍스트 — lg+ 에서만 표시 */}
          <span className="hidden lg:inline truncate">
            {isDark ? "라이트 모드" : "다크 모드"}
          </span>
        </button>
        <p className={`hidden lg:block text-xs mt-2 px-1 ${isDark ? "text-slate-600" : "text-slate-400"}`}>
          v0.1.0 · QM30VT3
        </p>
      </div>
    </aside>
  );
}
