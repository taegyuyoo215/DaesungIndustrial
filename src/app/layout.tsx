import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import { ThemeProvider } from "@/components/ThemeProvider";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "MOTOR-IQ | 모터 예지보전 진단 솔루션",
  description: "QM30VT3 기반 모터 상태 모니터링 및 고장 진단 플랫폼",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // 서버 렌더 시 dark 클래스를 미리 적용해 깜빡임(FOUC) 방지
    <html lang="ko" className="dark">
      <body className={`${geist.variable} font-sans antialiased`}>
        <ThemeProvider>
          <MobileNav />
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 overflow-auto min-w-0 pt-[84px] md:pt-0">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
