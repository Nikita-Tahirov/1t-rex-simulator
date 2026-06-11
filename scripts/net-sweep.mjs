/**
 * Аудит и уборка мусора сетевого режима в Firebase RTDB (`rooms`, `roomsIndex`).
 *
 * Дополняет клиентскую opportunistic-уборку (`src/netgame/net/roomSweep.ts`):
 * клиент видит только комнаты из индекса, скрипт — ВСЁ дерево, включая узлы,
 * невидимые из списка (комната без индекса, индекс без комнаты). Пригоден для
 * ручного аудита прода и регулярной профилактики.
 *
 * Запуск: `npm run net:sweep` — только отчёт (dry-run);
 *         `npm run net:sweep -- --apply` — удалить найденный мусор.
 *
 * Безопасность: скрипт работает под тем же Anonymous Auth, что и клиенты,
 * поэтому каждое удаление перепроверяется правилами `database.rules.json` на
 * сервере — комнату с живыми `players` снести нельзя (запись отклоняется, у
 * нас это «комната ожила», не ошибка). Временный анонимный пользователь
 * удаляется в конце, чтобы не копить мусор и в Firebase Auth.
 */

// Дефолты зеркалят публичный config rex-1t из src/netgame/net/firebaseConfig.ts
// (НЕ секреты); env-override — тот же, что у приложения.
const API_KEY = process.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyC5_rlOlL1GRQe-K9H90zNoAgctms52tFA';
const DATABASE_URL =
  process.env.VITE_FIREBASE_DATABASE_URL ??
  'https://rex-1t-default-rtdb.europe-west1.firebasedatabase.app';
const apply = process.argv.includes('--apply');

async function signInAnonymously() {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    },
  );
  if (!response.ok) throw new Error(`Anonymous Auth недоступен: HTTP ${response.status}`);
  return response.json();
}

async function deleteAnonymousUser(idToken) {
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  }).catch(() => {
    // Best-effort: неудалённый анонимный пользователь не влияет на данные.
  });
}

async function readNode(pathname, idToken) {
  const response = await fetch(`${DATABASE_URL}/${pathname}.json?auth=${idToken}`);
  if (!response.ok) throw new Error(`Чтение ${pathname}: HTTP ${response.status}`);
  return (await response.json()) ?? {};
}

/**
 * Классификация дерева:
 *  - ghostRooms — `players` пуст → мусор, удаляется вместе с индексом;
 *  - orphanIndex — запись индекса без комнаты → мусор;
 *  - unindexedLive — живая комната без записи в индексе (невидима в списке) —
 *    только отчёт: удалять нельзя (в ней люди), индекс пересоздаст reconcile.
 */
function classifyTree(rooms, roomsIndex) {
  const ghostRooms = [];
  const liveRooms = [];
  for (const [roomId, record] of Object.entries(rooms)) {
    const players = Object.keys(record?.players ?? {});
    if (players.length === 0) ghostRooms.push(roomId);
    else liveRooms.push({ roomId, players: players.length, status: record?.meta?.status });
  }
  const roomIds = new Set(Object.keys(rooms));
  const orphanIndex = Object.keys(roomsIndex).filter(
    (roomId) => !roomIds.has(roomId) && !ghostRooms.includes(roomId),
  );
  const indexIds = new Set(Object.keys(roomsIndex));
  const unindexedLive = liveRooms.filter((room) => !indexIds.has(room.roomId));
  return { ghostRooms, orphanIndex, liveRooms, unindexedLive };
}

/** Комната и её индекс сносятся одним multi-path PATCH (атомарно, как в адаптере). */
async function removeRoomEverywhere(roomId, idToken) {
  const response = await fetch(`${DATABASE_URL}/.json?auth=${idToken}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ [`rooms/${roomId}`]: null, [`roomsIndex/${roomId}`]: null }),
  });
  if (response.ok) return 'removed';
  // 401/403 — правила отклонили запись: комната ожила между чтением и
  // удалением. Это штатная гонка, а не сбой уборки.
  if (response.status === 401 || response.status === 403) return 'alive';
  return `failed (HTTP ${response.status})`;
}

async function main(idToken) {
  const [rooms, roomsIndex] = await Promise.all([
    readNode('rooms', idToken),
    readNode('roomsIndex', idToken),
  ]);
  const report = classifyTree(rooms, roomsIndex);

  console.log(`БД: ${DATABASE_URL}`);
  console.log(
    `комнат: ${Object.keys(rooms).length} (живых ${report.liveRooms.length}), индекс: ${Object.keys(roomsIndex).length}`,
  );
  for (const room of report.liveRooms) {
    console.log(`  живая: ${room.roomId} [${room.status}] players=${room.players}`);
  }
  for (const room of report.unindexedLive) {
    console.log(`  ВНИМАНИЕ: живая комната без индекса (невидима в списке): ${room.roomId}`);
  }
  console.log(
    `мусор: комнат-призраков ${report.ghostRooms.length}, осиротевших индексов ${report.orphanIndex.length}`,
  );

  const garbage = [...report.ghostRooms, ...report.orphanIndex];
  if (garbage.length === 0) {
    console.log('чисто: мусора в RTDB нет');
    return 0;
  }
  if (!apply) {
    for (const roomId of garbage) console.log(`  кандидат на удаление: ${roomId}`);
    console.log('dry-run: ничего не удалено; запусти с --apply для уборки');
    return 0;
  }
  let failures = 0;
  for (const roomId of garbage) {
    const outcome = await removeRoomEverywhere(roomId, idToken);
    console.log(`  ${roomId}: ${outcome}`);
    if (outcome.startsWith('failed')) failures += 1;
  }
  console.log(failures === 0 ? 'уборка завершена' : `уборка завершена с ошибками: ${failures}`);
  return failures === 0 ? 0 : 1;
}

// Сетевые сбои — штатный случай maintenance-CLI: внятное сообщение и код
// выхода вместо сырого стектрейса; временный анонимный пользователь удаляется
// в любом исходе.
const { idToken } = await signInAnonymously();
try {
  process.exitCode = await main(idToken);
} catch (error) {
  console.error(`ошибка: ${error?.cause?.code ?? ''} ${error.message}`.trim());
  process.exitCode = 1;
} finally {
  await deleteAnonymousUser(idToken);
}
