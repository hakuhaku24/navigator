import * as dotenv from 'dotenv';
dotenv.config({ path: '../../.env.local' });

async function testGoogleAPI() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log("🔍 API Key 前五碼:", apiKey?.substring(0, 5) + "...");

  // 列出這把 key 能用的所有模型，找出支援 embedContent 的
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();

  const models: any[] = data.models ?? [];
  console.log(`\n可用模型總數：${models.length}`);

  const embedModels = models.filter((m: any) =>
    m.supportedGenerationMethods?.includes('embedContent')
  );

  console.log(`\n✅ 支援 embedContent 的模型（${embedModels.length} 個）：`);
  for (const m of embedModels) {
    console.log(`  - ${m.name}  (displayName: ${m.displayName})`);
  }
}

testGoogleAPI();
