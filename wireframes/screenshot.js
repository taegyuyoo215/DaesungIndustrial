const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const htmlDir = path.join(__dirname, 'html');
const imgDir  = path.join(__dirname, 'images');
if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

const pages = [
  { file: '01_login.html',       name: '01_로그인',          w: 1280, h: 800  },
  { file: '02_dashboard.html',   name: '02_대시보드',        w: 1440, h: 900  },
  { file: '03_motor_detail.html',name: '03_모터상세분석',    w: 1440, h: 1200 },
  { file: '04_alarms.html',      name: '04_알람이력',        w: 1440, h: 900  },
  { file: '05_maintenance.html', name: '05_정비이력',        w: 1440, h: 900  },
  { file: '06_reports.html',     name: '06_보고서',          w: 1440, h: 900  },
  { file: '07_settings.html',    name: '07_설정',            w: 1440, h: 900  },
];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 1.5 });

  for (const p of pages) {
    const page = await context.newPage();
    await page.setViewportSize({ width: p.w, height: p.h });
    const url = 'file:///' + path.join(htmlDir, p.file).replace(/\\/g, '/');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const outPath = path.join(imgDir, `${p.name}.png`);
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`✅ ${p.name}.png`);
    await page.close();
  }

  await browser.close();
  console.log(`\n🎉 완료! 이미지 저장 위치: ${imgDir}`);
})();
