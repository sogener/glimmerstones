/** All interface strings (Russian). */

/** 1 ход, 2 хода, 5 ходов. */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const moves = (n: number) => `${n} ${plural(n, 'ход', 'хода', 'ходов')}`;

export const STR = {
  title: 'Glimmerstones',
  subtitle: 'мерцающие камни',
  level: (n: number) => `Уровень ${n}`,
  undo: 'Отменить',
  restart: 'Заново',
  addShelf: 'Полочка',
  hint: 'Подсказка',
  prevLevel: 'Предыдущий уровень',
  nextLevel: 'Следующий уровень',
  winTitle: 'Чудесно!',
  winText: (name: string) => `Картинка «${name}» готова и сохранена в галерею.`,
  next: 'Дальше',
  stuckTitle: 'Места не осталось',
  stuckText: 'Свободных ячеек больше нет. Ничего страшного — всё можно поправить.',
  stuckUndo: 'Отменить ход',
  stuckShelf: 'Добавить полочку',
  stuckRestart: 'Начать заново',
  hintLostTitle: 'Этот путь не сложится',
  hintLostText: (n: number) =>
    `Отсюда уже не собрать все камни. Давай вернёмся на ${moves(n)} назад — и я подскажу, как лучше.`,
  hintLostUndo: (n: number) => `Вернуться на ${moves(n)}`,
  notNow: 'Не сейчас',
  noHint: 'Здесь подсказка не нужна',
} as const;
