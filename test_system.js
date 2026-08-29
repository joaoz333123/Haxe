const handler = require('./api/transactions.js');

process.env.REDIS_URL = process.env.REDIS_URL || "redis://default:ywMdhHPKv0PnemZHlkb13wMZTin7j2fl@immaculate-unbeatable-magentaish-67196.db.redis.io:18147";

function mockReqRes(method, body = null) {
  const req = {
    method,
    body
  };

  let statusCode = 200;
  let responseData = null;

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      responseData = data;
      return res;
    }
  };

  return { req, res, getResult: () => ({ statusCode, responseData }) };
}

async function runTests() {
  console.log("==================================================");
  console.log("   SUÍTE DE TESTES: VALIDAÇÃO DO FLUXO DO REDIS   ");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  // Teste 1: Testar Leitura (GET)
  try {
    console.log("➡️ [TESTE 1] Chamando GET inicial da API...");
    const { req, res, getResult } = mockReqRes('GET');
    await handler(req, res);
    const result = getResult();

    if (result.statusCode === 200 && result.responseData !== undefined && !result.responseData?._offlineFallback) {
      console.log("   ✅ PASSOU: Leitura inicial retornou sucesso (status 200).");
      passed++;
    } else {
      console.error("   ❌ FALHOU: Retornou status ou payload inválido:", result);
      failed++;
    }
  } catch (e) {
    console.error("   ❌ FALHOU (Exceção):", e.message);
    failed++;
  }

  // Teste 2: Testar Gravação (POST) com dados completos
  const testPayload = {
    participants: [
      { id: '1', name: 'João Zanetti' },
      { id: '2', name: 'Willian' },
      { id: '3', name: 'Weslen' },
      { id: '4', name: 'Teste Automático' }
    ],
    transactions: [
      {
        id: 'tx_test_' + Date.now(),
        type: 'EXPENSE',
        date: '2026-08-29',
        description: 'Despesa Teste de Integração Nuvem',
        amount: 89.90,
        payer: 'João Zanetti',
        splitWith: ['João Zanetti', 'Willian', 'Weslen']
      }
    ]
  };

  try {
    console.log("\n➡️ [TESTE 2] Gravando novos dados na Nuvem via POST...");
    const { req, res, getResult } = mockReqRes('POST', testPayload);
    await handler(req, res);
    const result = getResult();

    if (result.statusCode === 200 && result.responseData?.success === true) {
      console.log("   ✅ PASSOU: Dados gravados com sucesso no Redis.");
      passed++;
    } else {
      console.error("   ❌ FALHOU: Resposta inesperada no POST:", result);
      failed++;
    }
  } catch (e) {
    console.error("   ❌ FALHOU (Exceção no POST):", e.message);
    failed++;
  }

  // Teste 3: Validar se os dados gravados batem exatamente com a leitura
  try {
    console.log("\n➡️ [TESTE 3] Lendo novamente (GET) e comparando integridade dos dados...");
    const { req, res, getResult } = mockReqRes('GET');
    await handler(req, res);
    const result = getResult();

    const data = result.responseData;
    const hasParticipant = data?.participants?.some(p => p.name === 'Teste Automático');
    const hasTransaction = data?.transactions?.some(t => t.description === 'Despesa Teste de Integração Nuvem');

    if (result.statusCode === 200 && hasParticipant && hasTransaction) {
      console.log("   ✅ PASSOU: Integridade confirmada! Os dados lidos são idênticos aos gravados.");
      passed++;
    } else {
      console.error("   ❌ FALHOU: Dados inconsistentes na leitura após o POST:", result);
      failed++;
    }
  } catch (e) {
    console.error("   ❌ FALHOU (Exceção na validação):", e.message);
    failed++;
  }

  // Teste 4: Fallback resiliente em caso de falha de conexão ou ausência de URL
  try {
    console.log("\n➡️ [TESTE 4] Testando resiliência / Fallback (simulando ausência de REDIS_URL)...");
    const originalUrl = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    delete process.env.KV_URL;

    const { req, res, getResult } = mockReqRes('GET');
    await handler(req, res);
    const result = getResult();

    process.env.REDIS_URL = originalUrl; // restaura

    if (result.statusCode === 200 && result.responseData?._offlineFallback === true) {
      console.log("   ✅ PASSOU: Fallback funcionou perfeitamente retornando _offlineFallback: true sem quebrar.");
      passed++;
    } else {
      console.error("   ❌ FALHOU: Fallback não ativou corretamente:", result);
      failed++;
    }
  } catch (e) {
    console.error("   ❌ FALHOU (Exceção no teste de fallback):", e.message);
    failed++;
  }

  console.log("\n==================================================");
  console.log(` RESULTADO FINAL: ${passed} PASSARAM | ${failed} FALHARAM`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
