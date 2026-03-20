"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/",            label: "대시보드",  icon: "⬛" },
  { href: "/fft",         label: "FFT 분석",  icon: "📊" },
  { href: "/motors",      label: "모터 목록", icon: "⚙️" },
  { href: "/alarms",      label: "알람 이력", icon: "🔔" },
  { href: "/maintenance", label: "정비 이력", icon: "🔧" },
  { href: "/reports",     label: "보고서",    icon: "📄" },
  { href: "/settings",    label: "설정",      icon: "⚙" },
];

export default function Sidebar() {
  const pathname        = usePathname();
  const { theme, toggle } = useTheme();
  const isDark          = theme === "dark";
  const [collapsed, setCollapsed] = useState(false);

  // localStorage에서 초기값 복원
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved !== null) setCollapsed(saved === "true");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", String(!prev));
      return !prev;
    });
  };

  return (
    <aside
      className={`
        hidden md:flex flex-col shrink-0 h-screen sticky top-0 transition-all duration-300 overflow-hidden
        ${collapsed ? "w-14" : "w-60"}
        ${isDark
          ? "bg-[#0f172a] border-r border-slate-800 text-slate-300"
          : "bg-white border-r border-slate-200 text-slate-600"
        }
      `}
    >
      {/* Logo + 토글 버튼 */}
      <div
        className={`
          pt-6 pb-5 shrink-0 flex items-center
          ${collapsed ? "justify-center px-0" : "justify-between px-4"}
          ${isDark ? "border-b border-slate-800" : "border-b border-slate-100"}
        `}
      >
        {collapsed ? (
          /* 아이콘 모드 */
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm text-white"
            style={{ background: "linear-gradient(135deg, #06b6d4, #3b82f6)" }}
          >
            M
          </div>
        ) : (
          /* 풀 모드 */
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-base text-white shrink-0"
              style={{
                background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
                boxShadow: "0 0 16px rgba(6,182,212,0.35)",
              }}
            >
              M
            </div>
            <div className="min-w-0">
              <p
                className={`text-[10px] font-medium tracking-widest uppercase leading-none truncate
                  ${isDark ? "text-slate-500" : "text-slate-400"}`}
              >
                FA-IT Solution
              </p>
              <h1
                className={`text-[15px] font-bold mt-0.5 leading-none
                  ${isDark ? "text-white" : "text-slate-900"}`}
              >
                MOTOR-IQ
              </h1>
            </div>
          </div>
        )}

        {/* 접기/펼치기 버튼 */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          className={`
            shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-colors
            ${collapsed ? "mt-1" : ""}
            ${isDark
              ? "text-slate-500 hover:bg-slate-800 hover:text-slate-300"
              : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            }
          `}
        >
          {collapsed ? (
            /* > 펼치기 */
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          ) : (
            /* < 접기 */
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          )}
        </button>
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
              className={`
                flex items-center rounded-lg text-sm font-medium transition-all py-2.5
                ${collapsed ? "justify-center px-2" : "gap-3 px-3"}
                ${isActive
                  ? isDark
                    ? "bg-sky-950/80 text-cyan-400 border border-sky-800/50"
                    : "bg-indigo-50 text-indigo-600 border border-indigo-100"
                  : isDark
                    ? "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                }
              `}
            >
              <span className="text-base shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer — 테마 토글 */}
      <div
        className={`
          py-3 shrink-0
          ${collapsed ? "px-2" : "px-3"}
          ${isDark ? "border-t border-slate-800" : "border-t border-slate-100"}
        `}
      >
        <button
          onClick={toggle}
          title={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
          className={`
            w-full flex items-center py-2 rounded-lg text-sm font-medium transition-all
            ${collapsed ? "justify-center px-2" : "gap-3 px-3"}
            ${isDark
              ? "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            }
          `}
        >
          <span className="shrink-0 w-[18px] h-[18px] flex items-center justify-center">
            {isDark ? (
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
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="w-[18px] h-[18px]">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </span>
          {!collapsed && (
            <span className="truncate">
              {isDark ? "라이트 모드" : "다크 모드"}
            </span>
          )}
        </button>

        {!collapsed && (
          <p className={`text-xs mt-2 px-1 ${isDark ? "text-slate-600" : "text-slate-400"}`}>
            v0.1.0 · QM30VT3
          </p>
        )}
      </div>
    </aside>
  );
}
