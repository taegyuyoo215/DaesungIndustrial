"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/",            label: "대시보드", icon: "⬛" },
  { href: "/motors",      label: "모터",     icon: "⚙️" },
  { href: "/alarms",      label: "알람",     icon: "🔔" },
  { href: "/maintenance", label: "정비",     icon: "🔧" },
  { href: "/reports",     label: "보고서",   icon: "📄" },
  { href: "/settings",    label: "설정",     icon: "⚙" },
];

// md 미만 화면에서만 표시되는 상단 네비게이션 바
export default function MobileNav() {
  const pathname = usePathname();

  return (
    <div className="md:hidden fixed top-0 inset-x-0 z-50 bg-slate-900 border-b border-slate-700">
      {/* 타이틀 바 */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-slate-800">
        <span className="text-sm font-bold text-white tracking-tight">MOTOR-IQ</span>
        <span className="text-[10px] text-slate-500">FA-IT Solution</span>
      </div>
      {/* 스크롤 가능한 탭 네비게이션 */}
      <div className="flex overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-4 py-2 text-[10px] font-medium transition-colors border-b-2 ${
                isActive
                  ? "text-blue-400 border-blue-400"
                  : "text-slate-400 border-transparent"
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
