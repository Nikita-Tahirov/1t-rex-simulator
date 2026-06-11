/**
 * Русские строки UI сетевого режима — единая точка локализации.
 *
 * В проекте нет i18n-библиотеки (строки русские, прямо в коде). Чтобы новые
 * сетевые экраны не размазывали текст по компонентам, держим их здесь одним
 * словарём. Существующие строки одиночного HUD не трогаем.
 */

export const NET_STRINGS = {
  // Кнопка входа и общее
  enterButton: 'Сетевой бой',
  back: 'Назад',
  toSolo: 'В одиночную игру',
  loading: 'Загрузка…',
  connecting: 'Подключение…',

  // Меню
  menuTitle: 'Сетевой бой',
  menuSubtitle: 'Совместные бои до четырёх роботов на большой арене',
  menuPlay: 'К списку комнат',

  // Имя игрока
  nameLabel: 'Ваше имя',
  namePlaceholder: 'Пилот',

  // Список комнат
  roomsTitle: 'Комнаты',
  roomsEmpty: 'Открытых комнат нет — создайте свою',
  roomsCreate: 'Создать комнату',
  roomsJoin: 'Войти',
  roomsRefresh: 'Обновить',
  roomNamePlaceholder: 'Название комнаты',
  roomPlayers: (count: number, max: number) => `${count}/${max} игроков`,
  roomFull: 'Заполнена',
  roomInProgress: 'Идёт бой',
  roomConnecting: 'Подключение к серверу…',
  netDegraded: 'Нет связи с сервером — локальный режим: комнаты видны только в этом браузере',
  netLocalMode: 'Локальный режим: комнаты видны только в этом браузере',
  netNoConnection:
    'Нет соединения с сервером боёв: комнаты не загрузятся. Проверьте сеть, VPN и блокировщики.',

  // Лобби
  lobbyTitle: 'Комната',
  lobbyHost: 'Хозяин',
  lobbyReady: 'Готов',
  lobbyNotReady: 'Не готов',
  lobbyYouReady: 'Я готов',
  lobbyYouNotReady: 'Отменить готовность',
  lobbyStart: 'Начать бой',
  lobbyWaiting: 'Ждём игроков и готовности…',
  lobbyNeedMore: 'Нужно минимум 2 игрока',
  lobbyLeave: 'Выйти из комнаты',
  lobbyStatusReady: 'готов',
  lobbyStatusNotReady: 'не готов',
  lobbyConnectionLost: 'связь потеряна',

  // Бой
  battleYouHealth: 'Ваш робот',
  battleOpponents: 'Соперники',
  battleAliveCount: (alive: number, total: number) => `Живых: ${alive} из ${total}`,
  battleCountdown: (sec: number) => `Бой начнётся через ${sec}`,
  battleLeave: 'Сдаться и выйти',
  cameraShoulder: 'Камера: со спины',
  cameraFollow: 'Камера: следом',

  // Результат
  resultVictory: 'Победа!',
  resultDefeat: 'Поражение',
  resultDraw: 'Ничья',
  resultWinner: (name: string) => `Победитель: ${name}`,
  resultRematch: 'Реванш',
  resultToRooms: 'В список комнат',
} as const;
