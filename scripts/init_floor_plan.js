const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'motoriq',
  user: 'motoriq_user',
  password: 'motoriq_pass',
});

const FLOOR_PLANS_DIR = path.join(process.cwd(), 'floor-plans');

// Minimal PDF content
const PDF_CONTENT = `%PDF-1.1
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
endobj
5 0 obj
<< /Length 200 >>
stream
BT
/F1 24 Tf
100 750 Td
(FACTORY FLOOR PLAN) Tj
/F1 14 Tf
0 -40 Td
(SAMPLE LAYOUT - FOR TESTING) Tj
ET
50 100 500 600 re
S
100 200 150 100 re
S
300 400 150 100 re
S
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000230 00000 n
0000000300 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
550
%%EOF`;

async function setup() {
  try {
    console.log('Ensuring directory exists...');
    if (!fs.existsSync(FLOOR_PLANS_DIR)) fs.mkdirSync(FLOOR_PLANS_DIR, { recursive: true });

    const fileName = 'sample_layout.pdf';
    const filePath = path.join(FLOOR_PLANS_DIR, fileName);
    
    console.log(`Writing sample PDF to ${filePath}...`);
    fs.writeFileSync(filePath, PDF_CONTENT, 'binary');

    console.log('Inserting database record...');
    // 이미 데이터가 있으면 삭제 후 삽입 (깔끔하게 교체)
    await pool.query("DELETE FROM floor_plans WHERE name LIKE '%SAMPLE%'");
    
    const res = await pool.query(
      "INSERT INTO floor_plans (site_id, name, file_path, file_name, page_count) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [1, '공장 메인 레이아웃 (SAMPLE)', filePath, 'sample_layout.pdf', 1]
    );

    console.log(`Sample floor plan (ID: ${res.rows[0].id}) inserted successfully.`);
    console.log('Now you can go to Dashboard -> Map View to see the sample plan!');

  } catch (err) {
    console.error('Error during setup:', err);
  } finally {
    await pool.end();
  }
}

setup();
